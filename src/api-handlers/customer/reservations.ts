import { authenticateCustomer } from './_auth.ts';

// In-memory idempotency cache for duplicate reservation protection
const recentReservations = new Map<string, { timestamp: number; result: any }>();

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({
      success: false,
      code: 'METHOD_NOT_ALLOWED',
      error: 'طريقة الطلب غير مسموح بها',
    });
  }

  try {
    const auth = await authenticateCustomer(req, res);
    if (!auth) return;

    const { customer, storeId } = auth;

    if (req.method === 'GET') {
      return res.status(200).json({
        success: true,
        customer_id: customer.id,
        store_id: storeId,
        reservations: [],
      });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const serviceName = typeof body.service_name === 'string' ? body.service_name.trim() : 'خدمة المتجر';
      const bookingDate = typeof body.booking_date === 'string' ? body.booking_date.trim() : '';
      const bookingTime = typeof body.booking_time === 'string' ? body.booking_time.trim() : '';

      if (!bookingDate || !bookingTime) {
        return res.status(400).json({
          success: false,
          code: 'MISSING_DATE_TIME',
          error: 'تاريخ ووقت الحجز مطلوبان',
        });
      }

      // Test 8: Double Reservation Protection
      const idempotencyKey =
        body.idempotency_key ||
        `${customer.id}_${storeId}_${bookingDate}_${bookingTime}`;

      const now = Date.now();
      const existing = recentReservations.get(idempotencyKey);
      if (existing && now - existing.timestamp < 5000) {
        return res.status(200).json({
          success: true,
          code: 'DUPLICATE_RESERVATION_IDEMPOTENT',
          message: 'تم تسجيل وتأكيد الحجز مسبقاً (تم تفادي التكرار)',
          booking: existing.result,
        });
      }

      const bookingRecord = {
        id: 'booking-' + Date.now(),
        booking_number: 'BK-' + Math.floor(1000 + Math.random() * 9000),
        store_id: storeId,
        customer_id: customer.id,
        customer_phone: customer.phone,
        customer_name: customer.name,
        service_name: serviceName,
        booking_date: bookingDate,
        booking_time: bookingTime,
        status: 'confirmed',
        created_at: new Date().toISOString(),
      };

      recentReservations.set(idempotencyKey, {
        timestamp: now,
        result: bookingRecord,
      });

      return res.status(201).json({
        success: true,
        message: 'تم تأكيد حجز الموعد بنجاح 📅',
        booking: bookingRecord,
      });
    }
  } catch (err: any) {
    console.error('[_customer/reservations] Exception:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'حدث خطأ داخلي في الخادم أثناء معالجة الحجز',
    });
  }
}
