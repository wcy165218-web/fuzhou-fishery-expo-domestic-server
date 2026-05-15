import assert from 'node:assert/strict';
import {
  normalizeHallLabel,
  normalizeBoothCode,
  deriveHallFromBoothCode,
  resolveHallFromMapName
} from '../src/utils/booth-map.mjs';
import {
  applyStateMetricsToBucket,
  resolveOrderPaymentStage
} from '../src/utils/helpers.mjs';
import { deriveBoothRuntimeStatus, resolveBoothCompanyText } from '../src/services/booth-map-view.mjs';
import { replaceOrderBoothCodes } from '../src/routes/booth-maps.mjs';


function runTests() {
  assert.equal(normalizeHallLabel('1'), '1号馆');
  assert.equal(normalizeHallLabel('2馆'), '2号馆');
  assert.equal(normalizeHallLabel('3号馆'), '3号馆');
  assert.equal(normalizeHallLabel('A馆'), 'A号馆');
  assert.equal(normalizeHallLabel('国际展区'), '国际展区');

  assert.equal(normalizeBoothCode(' 1a-09 '), '1A-09');
  assert.equal(normalizeBoothCode(''), '');
  assert.equal(normalizeBoothCode(null), '');

  assert.equal(deriveHallFromBoothCode('1A-09', ''), '1号馆');
  assert.equal(deriveHallFromBoothCode('  12b-01 ', ''), '12号馆');
  assert.equal(deriveHallFromBoothCode('VIP-01', '5馆'), '5号馆');
  assert.equal(deriveHallFromBoothCode('', '国际馆'), '国际号馆');

  assert.equal(resolveHallFromMapName('2026福州渔博会 8号馆 终版'), '8号馆');
  assert.equal(resolveHallFromMapName('国际展区地图'), '国际展区地图');
  assert.equal(resolveHallFromMapName(''), '');

  assert.equal(
    replaceOrderBoothCodes('1A01, 1A02 / 1A03', new Map([['1A02', '1B02']])),
    '1A01, 1B02, 1A03'
  );

  assert.deepEqual(
    deriveBoothRuntimeStatus('已锁定', []),
    {
      code: 'locked',
      label: '已锁定',
      fillColor: '#6b7280',
      strokeColor: '#374151'
    }
  );

  assert.deepEqual(
    deriveBoothRuntimeStatus('可售', []),
    {
      code: 'available',
      label: '可售',
      fillColor: '#ffffff',
      strokeColor: '#0f172a'
    }
  );

  assert.deepEqual(
    deriveBoothRuntimeStatus('可售', [{ total_amount: 1000, paid_amount: 0 }]),
    {
      code: 'reserved',
      label: '已预定',
      fillColor: '#f59e0b',
      strokeColor: '#b45309'
    }
  );

  assert.deepEqual(
    deriveBoothRuntimeStatus('可售', [{ total_amount: 1000, paid_amount: 200 }]),
    {
      code: 'deposit',
      label: '已付定金',
      fillColor: '#3b82f6',
      strokeColor: '#1d4ed8'
    }
  );

  assert.deepEqual(
    deriveBoothRuntimeStatus('可售', [{ total_amount: 1000, paid_amount: 1000 }]),
    {
      code: 'full_paid',
      label: '已付全款',
      fillColor: '#ef4444',
      strokeColor: '#991b1b'
    }
  );

  assert.deepEqual(
    deriveBoothRuntimeStatus('可售', [
      { total_amount: 1000, paid_amount: 1000 },
      { total_amount: 1000, paid_amount: 0 }
    ]),
    {
      code: 'deposit',
      label: '已付定金',
      fillColor: '#3b82f6',
      strokeColor: '#1d4ed8'
    }
  );

  assert.deepEqual(
    deriveBoothRuntimeStatus('可售', [
      { total_amount: 1000, paid_amount: 1000 },
      { total_amount: 2000, paid_amount: 2000 }
    ]),
    {
      code: 'full_paid',
      label: '已付全款',
      fillColor: '#ef4444',
      strokeColor: '#991b1b'
    }
  );

  assert.deepEqual(
    resolveBoothCompanyText('标摊', [
      { company_name: '福州海洋科技有限公司' },
      { booth_display_name: '厦门远洋渔业发展有限公司', company_name: '厦门远洋渔业有限公司' }
    ]),
    {
      companyText: '福州海洋科技有限公司\n厦门远洋渔业发展有限公司',
      companyTextSource: 'joint_order_company_names',
      companyNames: ['福州海洋科技有限公司', '厦门远洋渔业发展有限公司']
    }
  );

  assert.equal(resolveOrderPaymentStage(0, 0), 'full_paid');
  assert.equal(resolveOrderPaymentStage(0, 1000), 'reserved');
  assert.equal(resolveOrderPaymentStage(200, 1000), 'deposit');

  assert.deepEqual(
    deriveBoothRuntimeStatus('可售', [{ total_amount: 0, paid_amount: 0 }]),
    {
      code: 'full_paid',
      label: '已付全款',
      fillColor: '#ef4444',
      strokeColor: '#991b1b'
    }
  );

  const bucket = {
    reserved_booth_count: 0,
    deposit_booth_count: 0,
    full_paid_booth_count: 0,
    paid_booth_count: 0,
    company_count: 0,
    paid_company_count: 0
  };
  applyStateMetricsToBucket(bucket, 1, 0, 0, { includeCompany: true, includePaidCompany: true });
  assert.equal(bucket.reserved_booth_count, 0);
  assert.equal(bucket.deposit_booth_count, 0);
  assert.equal(bucket.full_paid_booth_count, 1);
  assert.equal(bucket.paid_booth_count, 1);
  assert.equal(bucket.company_count, 1);
  assert.equal(bucket.paid_company_count, 1);
}

runTests();
console.log('Booth rules tests passed');
