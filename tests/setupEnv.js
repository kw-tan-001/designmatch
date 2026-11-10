// Every test run uses NODE_ENV=test, which points the pool at TEST_DATABASE_URL.
process.env.NODE_ENV = 'test';
process.env.UPLOAD_DIR = process.env.UPLOAD_DIR || require('path').join(__dirname, '..', 'tmp-test-uploads');
