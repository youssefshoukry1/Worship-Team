package com.worship.app;

import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.concurrent.*;
import java.util.zip.ZipFile;
import org.json.JSONObject;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33)
public class PrayerIndexStorageTest {
    private File root;
    private static String data(String words) { return "{\"version\":1,\"guestPrays\":[{\"_id\":\"p\",\"words\":\"" + words + "\"}],\"recordings\":{}}"; }
    @Before public void setup() throws Exception { root = Files.createTempDirectory("prayer-index").toFile(); }
    private void raw(String name, String text) throws Exception { Files.write(new File(root, name).toPath(), text.getBytes(StandardCharsets.UTF_8)); }
    private PrayerIndexStorage.Snapshot seed() throws Exception { return PrayerIndexStorage.write(root, "missing", data("old")); }

    @Test public void firstRunAndExistingLegacyIndexKeepPathAndSchema() throws Exception {
        assertNull(PrayerIndexStorage.read(root).data);
        raw("index.json", "{\"guestPrays\":[],\"recordings\":{}}");
        PrayerIndexStorage.Snapshot old = PrayerIndexStorage.read(root);
        assertEquals(64, old.fingerprint.length());
        PrayerIndexStorage.write(root, old.fingerprint, data("صلاة"));
        assertEquals(data("صلاة"), PrayerIndexStorage.read(root).data);
        assertEquals(data("صلاة"), new String(Files.readAllBytes(new File(root, "index.json").toPath()), StandardCharsets.UTF_8));
    }
    @Test public void failureBeforeDuringAndAfterWritingPreservesCommittedHistory() throws Exception {
        PrayerIndexStorage.Snapshot old = seed();
        for (int count : new int[]{0, 8, Integer.MAX_VALUE}) {
            assertThrows(IOException.class, () -> PrayerIndexStorage.write(root, old.fingerprint, data("new"), (stream, bytes) -> {
                stream.write(bytes, 0, Math.min(count, bytes.length)); throw new IOException("Injected disk-full error");
            }));
            assertEquals(old.data, PrayerIndexStorage.read(root).data);
            assertEquals(old.fingerprint, PrayerIndexStorage.read(root).fingerprint);
        }
    }
    @Test public void failedFirstWriteNeverPublishesPartialIndex() throws Exception {
        assertThrows(IOException.class, () -> PrayerIndexStorage.write(root, "missing", data("new"), (stream, bytes) -> {
            stream.write(bytes, 0, 5); throw new IOException("Interrupted first write");
        }));
        assertNull(PrayerIndexStorage.read(root).data);
        assertEquals(data("retry"), PrayerIndexStorage.write(root, "missing", data("retry")).data);
    }
    @Test public void restartRecoversLegacyBackupAndDiscardsUncommittedTemporaryFile() throws Exception {
        raw("index.json.bak", data("recovered")); raw("index.json", "{partial");
        assertEquals(data("recovered"), PrayerIndexStorage.read(root).data);
        raw("index.json.new", "{partial");
        assertEquals(data("recovered"), PrayerIndexStorage.read(root).data);
        assertFalse(new File(root, "index.json.new").exists());
    }
    @Test public void missingPrimaryWithRecoveryFileIsNotAnEmptyStore() throws Exception {
        raw("index.json.bak", data("recovered"));
        assertEquals(data("recovered"), PrayerIndexStorage.read(root).data);
    }
    @Test public void corruptUnsupportedAndUnreadablePathsCannotBeOverwritten() throws Exception {
        for (String invalid : new String[]{"{broken", "{\"version\":2}", "{\"guestPrays\":null}", "{\"recordings\":{\"p\":{}}}"}) {
            raw("index.json", invalid);
            assertThrows(Exception.class, () -> PrayerIndexStorage.read(root));
            assertThrows(Exception.class, () -> PrayerIndexStorage.write(root, "missing", data("lost")));
            assertEquals(invalid, new String(Files.readAllBytes(new File(root, "index.json").toPath()), StandardCharsets.UTF_8));
        }
        File notDirectory = new File(root, "not-directory"); Files.write(notDirectory.toPath(), "keep".getBytes(StandardCharsets.UTF_8));
        assertThrows(Exception.class, () -> PrayerIndexStorage.read(notDirectory));
    }
    @Test public void lostCommitAcknowledgementLeavesCompleteNewIndexAndRejectsStaleWriter() throws Exception {
        PrayerIndexStorage.Snapshot old = seed();
        PrayerIndexStorage.write(root, old.fingerprint, data("committed")); // Simulate process loss before JS receives the result.
        assertEquals(data("committed"), PrayerIndexStorage.read(root).data);
        assertThrows(PrayerIndexStorage.Conflict.class, () -> PrayerIndexStorage.write(root, old.fingerprint, data("stale")));
        assertEquals(data("committed"), PrayerIndexStorage.read(root).data);
    }
    @Test public void competingWritersWithOneFingerprintCannotBothCommit() throws Exception {
        String fingerprint = seed().fingerprint;
        ExecutorService pool = Executors.newFixedThreadPool(2); CountDownLatch go = new CountDownLatch(1);
        try {
            Callable<Integer> writer = () -> { go.await(); try { PrayerIndexStorage.write(root, fingerprint, data(Thread.currentThread().getName())); return 1; } catch (PrayerIndexStorage.Conflict expected) { return 0; } };
            Future<Integer> a = pool.submit(writer), b = pool.submit(writer); go.countDown();
            assertEquals(1, (int) a.get(5, TimeUnit.SECONDS) + b.get(5, TimeUnit.SECONDS));
            assertNotEquals(fingerprint, PrayerIndexStorage.read(root).fingerprint);
        } finally { go.countDown(); pool.shutdownNow(); }
    }
    @Test public void backupReaderWaitsForCommitAndNeverSeesPartialBytes() throws Exception {
        String fingerprint = seed().fingerprint;
        raw("backup-prayers.json", "{\"userId\":\"alice\"}");
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch halfWritten = new CountDownLatch(1), finish = new CountDownLatch(1), reading = new CountDownLatch(1);
        File zip = new File(root, "backup.zip");
        try {
            Future<?> writer = pool.submit(() -> {
                try { PrayerIndexStorage.write(root, fingerprint, data("new"), (stream, bytes) -> {
                    stream.write(bytes, 0, 5); halfWritten.countDown();
                    try { if (!finish.await(5, TimeUnit.SECONDS)) throw new IOException("Timed out"); }
                    catch (InterruptedException e) { throw new IOException(e); }
                    stream.write(bytes, 5, bytes.length - 5);
                }); } catch (Exception e) { throw new RuntimeException(e); }
            });
            assertTrue(halfWritten.await(5, TimeUnit.SECONDS));
            Future<?> reader = pool.submit(() -> { reading.countDown(); try { PrayerBackupArchive.build(root, zip, "alice", p -> {}); } catch (Exception e) { throw new RuntimeException(e); } });
            assertTrue(reading.await(5, TimeUnit.SECONDS));
            assertThrows(TimeoutException.class, () -> reader.get(100, TimeUnit.MILLISECONDS));
            finish.countDown(); writer.get(5, TimeUnit.SECONDS); reader.get(5, TimeUnit.SECONDS);
            try (ZipFile archive = new ZipFile(zip)) {
                JSONObject manifest = new JSONObject(new String(archive.getInputStream(archive.getEntry("prays.json")).readAllBytes(), StandardCharsets.UTF_8));
                assertEquals("new", manifest.getJSONArray("prays").getJSONObject(0).getString("words"));
            }
        } finally { finish.countDown(); pool.shutdownNow(); }
    }
}
