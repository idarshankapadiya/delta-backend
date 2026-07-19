import { handleCorsOrigin } from './cors.config';

describe('handleCorsOrigin', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalPublicOrigin = process.env.PUBLIC_FRONTEND_ORIGIN;
  const originalBusinessOrigin = process.env.BUSINESS_FRONTEND_ORIGIN;

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_FRONTEND_ORIGIN = 'https://darshanent.co.in';
    process.env.BUSINESS_FRONTEND_ORIGIN = 'https://business.darshanent.co.in';
  });

  afterAll(() => {
    restoreEnvironment('NODE_ENV', originalNodeEnv);
    restoreEnvironment('PUBLIC_FRONTEND_ORIGIN', originalPublicOrigin);
    restoreEnvironment('BUSINESS_FRONTEND_ORIGIN', originalBusinessOrigin);
  });

  it('allows configured frontend origins', () => {
    const callback = jest.fn();

    handleCorsOrigin('https://darshanent.co.in', callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('does not raise CORS errors for blocked origins', () => {
    const callback = jest.fn();

    handleCorsOrigin('https://blocked.example.com', callback);

    expect(callback).toHaveBeenCalledWith(null, false);
  });

  it('allows no-origin requests for local tooling', () => {
    const callback = jest.fn();

    handleCorsOrigin(undefined, callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });
});

function restoreEnvironment(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
