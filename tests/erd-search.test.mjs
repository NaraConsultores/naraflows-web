import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const context = {};
vm.runInNewContext(await readFile(new URL('../erd-search.js', import.meta.url), 'utf8'), context);
const {createIndex} = context.NaraERSearch;

function sheet(id, name, tables) {
  return {id, name, tables};
}

function table(id, name, fields = []) {
  return {id, name, fields};
}

test('ranks whole names before prefixes and substrings across physical names and visible labels', () => {
  const find = createIndex([
    sheet('first', 'Registros', [
      table('log', 'Historial de emisión'),
      table('job', 'Emisiones pendientes'),
      table('request', 'Solicitud', [{id: 'date', name: 'fecha_01', label: 'Emisión'}]),
      table('exact', 'EMISIÓN')
    ])
  ]);

  assert.deepEqual(Array.from(find('  emision  '), result => [result.tableId, result.fieldId]), [
    ['exact', undefined], ['request', 'date'], ['job', undefined], ['log', undefined]
  ]);
  assert.equal(find('Emisión')[1].name, 'Emisión');
  const [field] = find('FECHA_01');
  assert.equal(field.physicalName, 'fecha_01');
  assert.equal(field.sheetName, 'Registros');
  assert.equal(field.tableName, 'Solicitud');
});

test('groups references by ID and still finds same-named tables and fields with distinct identities', () => {
  const field = {id: 'invoiceId', name: 'id', label: 'Código'};
  const models = [
    sheet('primary', 'Ventas', [table('invoice', 'Factura', [field])]),
    sheet('ref', 'Cobros', [table('invoice', 'Factura', [field])]),
    sheet('other', 'Compras', [table('purchase', 'Factura', [field])])
  ];
  const before = JSON.stringify(models);
  const find = createIndex(models);

  assert.deepEqual(Array.from(find('Factura'), result => result.sheetId), ['other', 'primary']);
  assert.deepEqual(Array.from(find('codigo'), result => [result.sheetId, result.tableId]), [
    ['other', 'purchase'], ['primary', 'invoice']
  ]);
  assert.equal(JSON.stringify(models), before);
});

test('uses the occurrence that best matches and keeps distinct IDs that normalize to one name', () => {
  const find = createIndex([
    sheet('a', 'Primera', [
      table('account', 'Cuentas', [
        {id: 'date', name: 'fecha'},
        {id: 'key1', name: 'código'},
        {id: 'key2', name: 'codigo'}
      ])
    ]),
    sheet('b', 'Segunda', [
      table('account', 'Cuentas', [{id: 'date', name: 'fecha', label: 'Día de emisión'}])
    ])
  ]);

  assert.deepEqual(Array.from(find('codigo'), result => result.fieldId), ['key1', 'key2']);
  assert.equal(find('dia de emision')[0].sheetId, 'b');
  assert.equal(find('fecha')[0].sheetId, 'a');
  assert.equal(find('inexistente').length, 0);
  assert.equal(find('  ').length, 0);
});
