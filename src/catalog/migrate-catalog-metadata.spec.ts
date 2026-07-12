import {
  buildCleanedMetadata,
  buildPreparedMetadata,
  metadataChanged,
} from './migrate-catalog-metadata';

describe('catalog metadata migration', () => {
  it('prepares legacy names idempotently while retaining display_name', () => {
    const legacy = {
      document_id: '01JABCDEF00000000000000000',
      company_slug: 'l-t',
      document_slug: 'legacy-custom-slug',
      display_name: 'Price List',
    };
    const prepared = buildPreparedMetadata(legacy);

    expect(prepared).toEqual({
      ...legacy,
      company_name: 'L T',
      document_name: 'Price List',
      document_slug: 'price-list',
    });
    expect(metadataChanged(legacy, prepared)).toBe(true);
    expect(metadataChanged(prepared, buildPreparedMetadata(prepared))).toBe(
      false,
    );
  });

  it('cleans display_name only after new metadata exists', () => {
    const prepared = {
      company_name: 'L & T',
      document_name: 'Price List',
      display_name: 'Price List',
    };

    expect(buildCleanedMetadata(prepared)).toEqual({
      ...prepared,
      display_name: null,
    });
    expect(metadataChanged(prepared, buildCleanedMetadata(prepared))).toBe(
      true,
    );

    const cleaned = {
      company_name: 'L & T',
      document_name: 'Price List',
    };
    expect(metadataChanged(cleaned, buildCleanedMetadata(cleaned))).toBe(false);
  });

  it('refuses cleanup before prepare is complete', () => {
    expect(() =>
      buildCleanedMetadata({
        company_slug: 'l-t',
        display_name: 'Price List',
      }),
    ).toThrow('prepare phase must complete');
  });
});
