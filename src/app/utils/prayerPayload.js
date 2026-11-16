let running = 0;
const pending = [];
function pump() {
    while (running < 2 && pending.length) {
        const job = pending.shift();
        if (!job.active()) { job.reject(new DOMException('Prayer session changed', 'AbortError')); continue; }
        running++;
        run(job.options, job.active).then(job.resolve, job.reject).finally(() => { running--; pump(); });
    }
}
export function downloadPrayerPayload(options, active = () => true) {
    return new Promise((resolve, reject) => { pending.push({ options, active, resolve, reject }); pump(); });
}
function run(options, active) {
    return new Promise((resolve, reject) => {
        let worker, timer, ownership, settled = false;
        const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); clearInterval(ownership); worker?.terminate(); if (error) reject(error); else resolve(value); };
        try {
            worker = new Worker(new URL('./prayerPayload.worker.js', import.meta.url));
            ownership = setInterval(() => { if (!active()) finish(new DOMException('Prayer session changed', 'AbortError')); }, 250);
            timer = setTimeout(() => finish(new Error('Prayer download timed out')), 120000);
            worker.onmessage = ({ data }) => finish(data.error ? Object.assign(new Error(data.error), { status: data.status, code: data.code }) : null, data.bundle);
            worker.onerror = event => { event.preventDefault(); finish(new Error('Prayer download could not finish')); };
            worker.onmessageerror = () => finish(new Error('Prayer delivery could not be read'));
            worker.postMessage(options);
        } catch (error) { finish(error); }
    });
}
