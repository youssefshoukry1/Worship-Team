export const metadata = {
  title: 'Privacy Policy - Wasla',
  description: 'Privacy Policy and Google User Data usage details for Wasla.',
};

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-[#001a2b] text-gray-200 px-4 py-12 md:px-12 lg:px-24">
      <div className="max-w-4xl mx-auto bg-[#07253d] border border-blue-900/40 rounded-2xl p-6 md:p-10 shadow-xl">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-sm text-blue-300 mb-8">Last Updated: October 25, 2026</p>

        <section className="space-y-6 text-sm md:text-base leading-relaxed">
          <div>
            <h2 className="text-xl font-semibold text-white mb-2">1. Introduction</h2>
            <p className="text-gray-300">
              Welcome to <strong>Wasla</strong>. We respect your privacy and are committed to protecting any personal information you share with us. This Privacy Policy outlines what information we process and how your data is protected.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-2">2. Information We Collect</h2>
            <p className="text-gray-300 mb-2">We handle information needed for account features and subscriptions:</p>
            <ul className="list-disc pl-6 space-y-1 text-gray-300">
              <li><strong>Account Information:</strong> Name, email address, and profile picture provided during registration or Google Sign-In.</li>
              <li><strong>Technical Data:</strong> Basic device and app performance data strictly for troubleshooting.</li>
              <li><strong>Subscriptions:</strong> Plan, payment provider, transaction identifiers, amount, currency, payment status and access dates. Purchase tokens needed for verification are encrypted at rest.</li>
            </ul>
          </div>

          <div className="p-4 rounded-xl bg-[#001a2b]/80 border border-blue-500/30">
            <h2 className="text-xl font-semibold text-blue-400 mb-2">3. Google User Data & Integration</h2>
            <p className="text-gray-300 mb-3">
              When using Google authentication or connected Google services:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-300">
              <li>
                <strong>Access:</strong> We only access basic profile information (email and name) to authenticate your identity, and your authorized storage space to save your personal data directly onto your own Google Drive.
              </li>
              <li>
                <strong>Limited Use Compliance:</strong> Wasla&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{' '}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 underline hover:text-blue-300"
                >
                  Google API Services User Data Policy
                </a>
                , including the Limited Use requirements.
              </li>
              <li>
                <strong>No Sale or Advertising:</strong> Wasla does not sell or rent your Google account data, or use it for advertising or to train AI models. Service providers receive information needed to perform the features you request, as described in this policy.
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-2">4. Data Storage & Security</h2>
            <p className="text-gray-300">
              All communications are protected using standard encryption (HTTPS/TLS). Any files you choose to store remain directly inside your personal Google Drive account.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-2">5. User Rights & Revoking Access</h2>
            <p className="text-gray-300 mb-2">
              You can revoke Wasla&apos;s access at any time through{' '}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 underline hover:text-blue-300"
              >
                Google Security Settings
              </a>.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-2">Payments and Subscriptions</h2>
            <p className="text-gray-300">Website payments are processed by Paymob. Billing details you enter, such as your name, email, phone number and address, are sent to Paymob to process your payment. Native Android and iOS purchases are processed by Google Play and Apple respectively. Wasla verifies purchases and provider notifications to activate access, restore purchases, process subscription changes and prevent reuse on another account. Wasla does not store full card numbers, card security codes or wallet PINs. Payment providers process payment information under their own privacy policies. Payment records may need to be retained to resolve refunds, disputes or accounting obligations.</p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-2">6. Contact Us</h2>
            <p className="text-gray-300">
              For any questions, reach out to us at:{' '}
              <a href="mailto:wasla.supports@gmail.com" className="text-blue-400 underline">
                wasla.supports@gmail.com
              </a>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
