import http from 'http';
import * as Promise from 'bluebird';
import request from 'supertest';
import merge from 'lodash.merge';
import cookie from 'cookie';
import session from '../lib/index';
import MemoryStore from '../lib/session/memory';

const modifyReq = (handler, reqq) => (req, res) => {
  if (req.headers.cookie) req.cookies = cookie.parse(req.headers.cookie);
  else req.cookies = {};
  merge(req, reqq);
  //  special case for should do nothing if req.session is defined
  if (req.url === '/definedSessionTest') {
    req.session = {};
  }
  return handler(req, res);
};

describe('session', () => {
  const server = http.createServer(
    modifyReq(
      session((req, res) => {
        if (req.method === 'POST') {
          req.session.johncena = 'invisible';
          return res.end();
        }
        if (req.method === 'GET') return res.end(req.session.johncena || '');
        if (req.method === 'DELETE') {
          req.session.destroy();
          return res.end();
        }
        return res.end();
      }, {
        cookie: {
          maxAge: 10000,
        },
      }),
    ),
  );
  beforeEach(() => Promise.promisify(server.listen.bind(server))());
  afterEach(() => Promise.promisify(server.close.bind(server))());

  test('should export Session, Store, Cookie, and MemoryStore', () => {
    expect(typeof session.Session).toStrictEqual('function');
    expect(typeof session.Store).toStrictEqual('function');
    expect(typeof session.Cookie).toStrictEqual('function');
    expect(typeof session.MemoryStore).toStrictEqual('function');
  });

  test('should default to MemoryStore', () => {
    //  Model req, res
    const req = { cookies: {} };
    const res = { end: () => null };
    const handler = req => req.sessionStore;
    return session(handler)(req, res).then((result) => {
      expect(result).toBeInstanceOf(MemoryStore);
    });
  });

  test.each([10, 'string', true, {}])(
    'should throw if generateId is not a function',
    (generateId) => {
      expect(() => { session(null, { generateId }); }).toThrow();
    },
  );
  test('should do nothing if req.session is defined', () => request(server).get('/definedSessionTest')
    .then(({ header }) => expect(header).not.toHaveProperty('set-cookie')));

  test('should create session properly and persist sessionId', () => {
    const agent = request.agent(server);
    return agent.post('/')
      .then(() => agent.get('/').expect('invisible'))
      .then(({ header }) => expect(header).not.toHaveProperty('set-cookie'));
    //  should not set cookie since session with data is established
  });

  test('should destroy session properly and refresh sessionId', () => {
    const agent = request.agent(server);
    return agent.post('/')
      .then(() => agent.delete('/'))
      .then(() => agent.get('/').expect(''))
      .then(({ header }) => expect(header).toHaveProperty('set-cookie'));
    //  should set cookie since session was destroyed
  });
});