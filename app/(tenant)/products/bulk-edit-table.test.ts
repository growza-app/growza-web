import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');

describe('Option 1 — Edit / Delete Big Spreadsheet Table for Products/Menu and Services', () => {
  const productsList = read('./ProductsList.tsx');
  const bulkProducts = read('./BulkEditProductsModal.tsx');
  const servicesTable = read('../services/ServicesTable.tsx');
  const bulkServices = read('../services/BulkEditServicesModal.tsx');
  const apiSrc = read('../lib/api.ts');
  const css = read('../styles/96-products.css');
  const en = JSON.parse(read('../../../messages/en.json')) as Record<string, unknown>;
  const hi = JSON.parse(read('../../../messages/hi.json')) as Record<string, unknown>;

  it('wires Edit / Delete button in ProductsList and ServicesTable without multi-select checkboxes and gates ProductsList on canStockTake && writable', () => {
    expect(productsList).toContain("t('bulkTable.open')");
    expect(productsList).toContain('bulkEditOpen && canStockTake && writable');
    expect(productsList).not.toMatch(/\{writable \?\s*\(\s*<button[^>]*prd-bulk-edit-btn/);
    expect(productsList).toContain('<BulkEditProductsModal');
    expect(servicesTable).toContain("t('bulkTable.open')");
    expect(servicesTable).toContain('<BulkEditServicesModal');
    expect(bulkProducts).not.toContain('type="checkbox"');
    expect(bulkServices).not.toContain('type="checkbox"');
  });

  it('supports inline editing, category filtering including No category, category rename, and bulk delete of shown or category items', () => {
    expect(bulkProducts).toContain('api.deleteProducts(branchId, ids)');
    expect(bulkProducts).toContain('api.deleteProductCategory(branchId, catId, { deleteProducts: true })');
    expect(bulkProducts).toContain('api.renameProductCategory(branchId, selectedCategoryObj.id, trimmed)');
    expect(bulkProducts).toContain('api.updateProduct(item.id, item.body)');
    expect(bulkProducts).toContain('if (updatedById.size > 0)');
    expect(bulkServices).toContain('api.deleteServices(branchId, chunk)');
    expect(bulkServices).toContain('if (res.blocked.length > 0) blockedAll.push(...res.blocked)');
    expect(bulkServices).toContain('formatBlockedMessage(blockedAll)');
    expect(bulkServices).toContain('api.renameCategory(branchId, selectedCategoryObj.id, trimmed)');
    expect(bulkServices).toContain('api.updateService(item.id, item.body)');
    expect(bulkServices).toContain('if (savedIds.size > 0)');
    expect(apiSrc).toContain('/api/v1/products/${id}?location=');
    expect(apiSrc).toContain('&deleteProducts=true');
  });

  it('defines responsive modal and sticky table header styles using design tokens, and independent desktop scroll for menu and edit sheet', () => {
    expect(css).toContain('.bulk-edit-modal');
    expect(css).toContain('.bulk-edit-table');
    expect(css).toContain('.bulk-cell-input');
    expect(css).toMatch(/\.page-body\.prd-desk\s*\{[\s\S]*?overflow:\s*hidden;/);
    expect(css).toMatch(/\.prd-menu-cards-wrap\s*\{[\s\S]*?overflow-y:\s*auto;/);
    expect(css).toContain('.prd-desk-grid.has-sheet .prd-table th:nth-last-child(3)');
    expect(productsList).toContain("activeEl?.scrollIntoView({ block: 'nearest' })");
  });

  it('ships matching English and Hindi strings for products.bulkTable and services.bulkTable', () => {
    const prodEn = Object.keys((en.products as Record<string, Record<string, unknown>>).bulkTable!).sort();
    const prodHi = Object.keys((hi.products as Record<string, Record<string, unknown>>).bulkTable!).sort();
    expect(prodEn).toEqual(prodHi);

    const svcEn = Object.keys((en.services as Record<string, Record<string, unknown>>).bulkTable!).sort();
    const svcHi = Object.keys((hi.services as Record<string, Record<string, unknown>>).bulkTable!).sort();
    expect(svcEn).toEqual(svcHi);
  });
});
