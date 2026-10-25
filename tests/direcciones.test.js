const test   = require('node:test');
const assert = require('node:assert/strict');
const { splitStreetNumber, formatAddress, sameAddress } = require('../js/pedidos.js');

test('separa calle y número de la dirección vieja del perfil', () => {
  assert.deepEqual(splitStreetNumber('Av. del Libertador 1234'), { calle: 'Av. del Libertador', numero: '1234' });
  assert.deepEqual(splitStreetNumber('Calle 9 de Julio 55B'), { calle: 'Calle 9 de Julio', numero: '55B' });
  assert.deepEqual(splitStreetNumber('Barrio Los Alisos lote 12 '), { calle: 'Barrio Los Alisos lote', numero: '12' });
  assert.deepEqual(splitStreetNumber('Sin número'), { calle: 'Sin número', numero: '' });
  assert.deepEqual(splitStreetNumber(null), { calle: '', numero: '' });
});

test('arma el texto de la dirección para el pedido', () => {
  assert.equal(
    formatAddress({ calle: 'Av. Siempre Viva', numero: '742', piso_depto: '3B', localidad: 'Nordelta', referencia: 'portón negro' }),
    'Av. Siempre Viva 742 - 3B - Nordelta (Ref: portón negro)'
  );
  assert.equal(formatAddress({ calle: 'Ruta 27', numero: '100', piso_depto: '', localidad: '', referencia: ' ' }), 'Ruta 27 100');
  assert.equal(formatAddress(null), '');
});

test('detecta direcciones repetidas sin importar mayúsculas ni espacios', () => {
  const a = { calle: 'Av. Siempre Viva', numero: '742', piso_depto: '3B', localidad: 'Nordelta' };
  assert.equal(sameAddress(a, { calle: 'av. siempre viva ', numero: '742', piso_depto: '3b', localidad: 'NORDELTA', referencia: 'otra' }), true);
  assert.equal(sameAddress(a, { ...a, numero: '743' }), false);
});
