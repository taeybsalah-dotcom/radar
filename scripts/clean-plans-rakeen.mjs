import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.zagpvflyizbmzsbmhnts:HXluTtgZ4UgGarxW@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres'
});

async function main() {
  await client.connect();

  const basicFeatures = [
    'الكاشير',
    'الفاتورة الضريبية',
    'العمل بدون إنترنت',
    'إغلاق الوردية',
    'المنيو',
    'الطلبات والاسترجاع',
    'التقرير اليومي',
    'الموظفين'
  ];

  const imadFeatures = [
    'شاشة المطبخ وطباعته',
    'شاشة العميل',
    'المخزون والوصفات والتنبيهات',
    'قراءة فواتير الموردين بالتصوير',
    'تكلفة الأطباق وصافي الربح',
    'برنامج الولاء وبطاقة الجوال',
    'الطاولات والحجوزات',
    'تطبيقات التوصيل',
    'صلاحيات الموظفين',
    'التقارير الكاملة وExcel'
  ];

  const sarhFeatures = [
    'متجر إلكتروني بدون عمولة',
    'صفحة حجز المواعيد',
    'تعدد الفروع وتقارير لكل فرع',
    'دعم أولوية'
  ];

  for (const tenant of ['radar', 'sadeem']) {
    // 1. BASIC (أساس)
    await client.query(`
      UPDATE billing_plans
      SET 
        name = 'أساس',
        description = 'تبيع، وتطبع، وتقفّل يومك',
        badge_text = NULL,
        cumulative_note = NULL,
        features_list = $1::jsonb
      WHERE tenant_id = $2 AND code = 'BASIC'
    `, [JSON.stringify(basicFeatures), tenant]);

    // 2. ADVANCED (عماد)
    await client.query(`
      UPDATE billing_plans
      SET 
        name = 'عماد',
        description = 'تعرف وش تكسب، والعميل يرجع لك',
        badge_text = 'الأكثر طلباً ⭐',
        cumulative_note = 'كل اللي في أساس، وفوقها:',
        features_list = $1::jsonb
      WHERE tenant_id = $2 AND code = 'ADVANCED'
    `, [JSON.stringify(imadFeatures), tenant]);

    // 3. PRO (صرح)
    await client.query(`
      UPDATE billing_plans
      SET 
        name = 'صرح',
        description = 'يطلبون منك مباشرة، وتكبر لأكثر من فرع',
        badge_text = 'الأشمل 👑',
        cumulative_note = 'كل اللي في عماد، وفوقها:',
        features_list = $1::jsonb
      WHERE tenant_id = $2 AND code = 'PRO'
    `, [JSON.stringify(sarhFeatures), tenant]);
  }

  console.log('✅ Cleaned up billing_plans records for radar & sadeem to exact Rakeen standards');

  const check = await client.query('SELECT tenant_id, code, name, description, monthly_amount, yearly_amount, badge_text FROM billing_plans ORDER BY tenant_id, tier_level');
  console.table(check.rows);

  await client.end();
}
main();
