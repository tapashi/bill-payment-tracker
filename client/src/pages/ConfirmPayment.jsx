import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';

const COUNTRY_CODE = '91';

export default function ConfirmPayment() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading'); // loading, ready, confirming, confirmed, already_paid, error
  const [utr, setUtr] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [showConfirmForm, setShowConfirmForm] = useState(false);
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    api
      .get(`/payments/confirm/${token}`)
      .then((r) => {
        setData(r.data);
        setStatus(r.data.status === 'paid' ? 'already_paid' : 'ready');
      })
      .catch(() => setStatus('error'));
  }, [token]);

  const handleConfirm = async () => {
    setValidationError('');

    if (!utr.trim()) {
      setValidationError('UPI Transaction Reference (UTR) is required.');
      return;
    }
    if (!screenshot) {
      setValidationError('Payment screenshot is required.');
      return;
    }

    setStatus('confirming');
    try {
      const formData = new FormData();
      formData.append('utr', utr.trim());
      formData.append('payment_method', 'upi');
      formData.append('screenshot', screenshot);

      const res = await api.post(`/payments/confirm/${token}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setData({ ...data, ...res.data });
      setStatus(res.data.already_paid ? 'already_paid' : 'confirmed');
    } catch (err) {
      const msg = err.response?.data?.error;
      if (msg) {
        setValidationError(msg);
        setStatus('ready');
        setShowConfirmForm(true);
      } else {
        setStatus('error');
      }
    }
  };

  const extractUpiId = (paymentDetails) => {
    if (!paymentDetails) return null;
    const match = paymentDetails.match(/[\w.\-]+@[\w]+/);
    return match ? match[0] : null;
  };

  const getUpiDeepLink = () => {
    if (!data) return null;
    const upiId = extractUpiId(data.payment_details);
    if (!upiId) return null;
    const params = new URLSearchParams({
      pa: upiId,
      pn: data.admin?.name || 'Payment',
      am: String(data.amount),
      tn: data.title,
      cu: 'INR',
    });
    return `upi://pay?${params.toString()}`;
  };

  const notifyAdmin = () => {
    if (!data?.admin) return;
    const message = `✅ Payment Confirmed!\n\nName: ${data.name}\nAmount: ₹${data.amount}\nFor: ${data.title}\nTime: ${new Date().toLocaleString()}`;
    const waUrl = `https://wa.me/${COUNTRY_CODE}${data.admin.phone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 text-lg">Loading...</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <p className="text-6xl mb-4">❌</p>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Invalid Link</h1>
          <p className="text-gray-500">This confirmation link is invalid or expired.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <p className="text-5xl mb-3">💰</p>
          <h1 className="text-xl font-bold text-gray-900">Payment Confirmation</h1>
        </div>

        <div className="space-y-3 mb-6">
          <div className="flex justify-between py-2 border-b">
            <span className="text-gray-500">Name</span>
            <span className="font-medium">{data.name}</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-gray-500">Purpose</span>
            <span className="font-medium">{data.title}</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-gray-500">Amount</span>
            <span className="font-bold text-lg">₹{data.amount}</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-gray-500">Pay To</span>
            <span className="font-medium text-sm">{data.payment_details}</span>
          </div>
        </div>

        {status === 'ready' && !showConfirmForm && (
          <div className="space-y-3">
            {getUpiDeepLink() && (
              <a
                href={getUpiDeepLink()}
                className="block w-full bg-purple-600 text-white py-3 rounded-md hover:bg-purple-700 font-medium text-lg text-center"
              >
                💳 Pay ₹{data.amount} via UPI App
              </a>
            )}
            <button
              onClick={() => setShowConfirmForm(true)}
              className="w-full bg-green-600 text-white py-3 rounded-md hover:bg-green-700 font-medium text-lg"
            >
              ✅ I Have Paid
            </button>
            <p className="text-xs text-gray-400 text-center">
              {getUpiDeepLink()
                ? 'Tap "Pay via UPI App" to open your UPI app, or click "I Have Paid" if you already paid.'
                : 'Make the payment using the details above, then click "I Have Paid".'}
            </p>
          </div>
        )}

        {status === 'ready' && showConfirmForm && (
          <div className="space-y-4">
            {validationError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-700 text-sm">{validationError}</p>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                UPI Transaction Reference (UTR) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={utr}
                onChange={(e) => setUtr(e.target.value)}
                placeholder="e.g. 412345678901"
                required
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">
                You can find this in your UPI app's transaction history.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Screenshot <span className="text-red-500">*</span>
              </label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  setScreenshot(e.target.files[0] || null);
                  setValidationError('');
                }}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
              />
              {screenshot && (
                <div className="mt-2">
                  <img
                    src={URL.createObjectURL(screenshot)}
                    alt="Preview"
                    className="max-h-40 rounded-md border border-gray-200"
                  />
                </div>
              )}
              <p className="text-xs text-gray-400 mt-1">
                Upload an original, unedited screenshot from your UPI app. Edited images will be rejected.
              </p>
            </div>
            <button
              onClick={handleConfirm}
              disabled={!utr.trim() || !screenshot}
              className="w-full bg-green-600 text-white py-3 rounded-md hover:bg-green-700 font-medium text-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ✅ Confirm Payment
            </button>
            <button
              onClick={() => { setShowConfirmForm(false); setValidationError(''); }}
              className="w-full text-gray-500 text-sm hover:text-gray-700"
            >
              ← Go back
            </button>
          </div>
        )}

        {status === 'confirming' && (
          <div className="text-center py-4">
            <p className="text-gray-500">Confirming payment...</p>
          </div>
        )}

        {status === 'confirmed' && (
          <div className="text-center">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <p className="text-green-700 font-medium">Payment confirmed successfully! 🎉</p>
            </div>
            {data.admin && (
              <button
                onClick={notifyAdmin}
                className="w-full bg-green-500 text-white py-3 rounded-md hover:bg-green-600 font-medium"
              >
                📱 Notify Admin ({data.admin.name}) via WhatsApp
              </button>
            )}
          </div>
        )}

        {status === 'already_paid' && (
          <div className="text-center">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-blue-700 font-medium">This payment was already confirmed. ✅</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
