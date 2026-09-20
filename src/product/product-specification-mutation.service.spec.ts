import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ProductMutationService } from './product-mutation.service';

describe('ProductMutationService specification mutations', () => {
  function fixture(specifications: Record<string, unknown>, exists = true) {
    const update = jest.fn();
    const reference = {};
    const firestore = {
      collection: () => ({ doc: () => reference }),
      runTransaction: (callback: (transaction: unknown) => Promise<unknown>) =>
        callback({
          get: () =>
            Promise.resolve({
              exists,
              data: () => ({ specifications }),
            }),
          update,
        }),
    };
    const service = new ProductMutationService();
    (service as unknown as { firestore: unknown }).firestore = firestore;
    return { service, update, reference };
  }

  it('renames a key and preserves other specifications', async () => {
    const { service, update, reference } = fixture({ color: 'red', size: 10 });

    await expect(
      service.updateProductSpecification('item', 'color', {
        key: 'finish',
        value: 'blue',
      }),
    ).resolves.toEqual({
      ok: true,
      productId: 'item',
      key: 'finish',
      value: 'blue',
    });
    expect(update).toHaveBeenCalledWith(
      reference,
      expect.objectContaining({ specifications: { size: 10, finish: 'blue' } }),
    );
  });

  it('deletes only the requested key', async () => {
    const { service, update, reference } = fixture({ color: null, size: 10 });

    await expect(
      service.deleteProductSpecification('item', 'color'),
    ).resolves.toEqual({
      ok: true,
      productId: 'item',
      deletedKey: 'color',
    });
    expect(update).toHaveBeenCalledWith(
      reference,
      expect.objectContaining({ specifications: { size: 10 } }),
    );
  });

  it('rejects missing keys, duplicate rename targets, and invalid values', async () => {
    const { service, update } = fixture({ color: 'red', size: 10 });

    await expect(
      service.updateProductSpecification('item', 'color', {
        key: 'size',
        value: 12,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.deleteProductSpecification('item', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.updateProductSpecification('item', 'color', {
        value: [] as unknown as string,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('returns 404 when the product is missing', async () => {
    const { service, update } = fixture({}, false);

    await expect(
      service.deleteProductSpecification('missing-product', 'color'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });
});
