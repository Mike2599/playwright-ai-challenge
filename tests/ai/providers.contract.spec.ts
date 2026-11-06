import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';
import * as allure from 'allure-js-commons';
import { z } from 'zod';
import { AIClient, AIProviderError } from '../../src/ai/AIClient';
import type { AIExchange, AIProviderName } from '../../src/ai/types';

/**
 * Pruebas de contrato del cliente de IA contra un servidor HTTP local que imita a cada proveedor.
 * Verifican, sin gastar tokens ni depender de la red, que cada adaptador arma la petición correcta
 * (URL, autenticación, formato JSON) y entiende la respuesta; además de reintentos y manejo de errores.
 * No usan navegador: importan el `test` base de Playwright, no los fixtures del proyecto.
 */
interface Captured {
  url: string;
  headers: http.IncomingHttpHeaders;
  body: Record<string, unknown>;
}

type Responder = (captured: Captured, call: number) => { status: number; body: unknown };

async function withMockProvider(respond: Responder, run: (baseUrl: string, calls: Captured[]) => Promise<void>): Promise<void> {
  const calls: Captured[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const captured = { url: req.url ?? '', headers: req.headers, body: JSON.parse(raw || '{}') };
      calls.push(captured);
      const { status, body } = respond(captured, calls.length);
      res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, calls);
  } finally {
    server.close();
  }
}

const RESPONSES: Record<AIProviderName, (text: string) => unknown> = {
  openai: (text) => ({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 11, completion_tokens: 7 } }),
  anthropic: (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 11, output_tokens: 7 } }),
  ollama: (text) => ({ message: { content: text }, prompt_eval_count: 11, eval_count: 7 }),
};

const client = (provider: AIProviderName, baseUrl: string, exchanges: AIExchange[] = [], maxRetries = 2) =>
  new AIClient(
    { provider, model: `${provider}-model`, apiKey: 'sk-secreta-123', baseUrl, timeoutMs: 5_000, maxRetries },
    [(exchange) => void exchanges.push(exchange)],
  );

const Answer = z.object({ answer: z.string() });

test.describe('Contrato de los proveedores de IA', { tag: ['@ai', '@providers'] }, () => {
  test.beforeEach(async () => {
    await allure.epic('Framework');
    await allure.feature('Cliente de IA');
  });

  const expectations: Record<AIProviderName, { path: string; auth: (h: http.IncomingHttpHeaders) => void; json: (b: Record<string, unknown>) => void }> = {
    openai: {
      path: '/chat/completions',
      auth: (h) => expect(h.authorization).toBe('Bearer sk-secreta-123'),
      json: (b) => expect(b.response_format).toEqual({ type: 'json_object' }),
    },
    anthropic: {
      path: '/v1/messages',
      auth: (h) => {
        expect(h['x-api-key']).toBe('sk-secreta-123');
        expect(h['anthropic-version']).toBe('2023-06-01');
      },
      json: (b) => {
        expect(String(b.system)).toContain('JSON Schema');
        expect(b.max_tokens).toBeGreaterThan(0);
      },
    },
    ollama: {
      path: '/api/chat',
      auth: (h) => expect(h.authorization).toBeUndefined(),
      json: (b) => expect(b.format).toMatchObject({ type: 'object', required: ['answer'] }),
    },
  };

  for (const provider of Object.keys(expectations) as AIProviderName[]) {
    test(`${provider}: arma la petición, entiende la respuesta y no expone la API key`, async () => {
      const exchanges: AIExchange[] = [];
      await withMockProvider(
        () => ({ status: 200, body: RESPONSES[provider]('```json\n{"answer":"42"}\n```') }),
        async (baseUrl, calls) => {
          const result = await client(provider, baseUrl, exchanges).completeJSON(
            { purpose: 'contrato', system: 'Eres un oráculo.', user: '¿Respuesta?', temperature: 0 },
            Answer,
          );

          expect(result).toEqual({ answer: '42' });
          expect(calls).toHaveLength(1);
          expect(calls[0].url).toBe(expectations[provider].path);
          expectations[provider].auth(calls[0].headers);
          expectations[provider].json(calls[0].body);
          expect(JSON.stringify(calls[0].body)).toContain('¿Respuesta?');
          expect(calls[0].body.model).toBe(`${provider}-model`);

          expect(exchanges).toHaveLength(1);
          expect(exchanges[0]).toMatchObject({ ok: true, provider, usage: { inputTokens: 11, outputTokens: 7 } });
          expect(JSON.stringify(exchanges[0]), 'la API key nunca llega al reporte').not.toContain('sk-secreta-123');
        },
      );
    });
  }

  test('reintenta ante un 503 y luego responde', async () => {
    await withMockProvider(
      (_c, call) => (call === 1 ? { status: 503, body: { error: 'sobrecargado' } } : { status: 200, body: RESPONSES.openai('ok') }),
      async (baseUrl, calls) => {
        const completion = await client('openai', baseUrl).complete({ purpose: 'retry', system: 's', user: 'u' });
        expect(completion.text).toBe('ok');
        expect(calls).toHaveLength(2);
      },
    );
  });

  test('si el modelo no admite temperature repite la llamada sin ese parámetro', async () => {
    await withMockProvider(
      (captured) =>
        'temperature' in captured.body
          ? { status: 400, body: { error: { message: "Unsupported value: 'temperature' does not support 0" } } }
          : { status: 200, body: RESPONSES.openai('ok') },
      async (baseUrl, calls) => {
        await client('openai', baseUrl).complete({ purpose: 'temperature', system: 's', user: 'u', temperature: 0 });
        expect(calls).toHaveLength(2);
        expect('temperature' in calls[1].body).toBe(false);
      },
    );
  });

  test('un 401 no se reintenta y produce un error claro', async () => {
    await withMockProvider(
      () => ({ status: 401, body: { error: 'invalid api key' } }),
      async (baseUrl, calls) => {
        const call = client('anthropic', baseUrl).complete({ purpose: 'auth', system: 's', user: 'u' });
        await expect(call).rejects.toThrow(AIProviderError);
        await expect(call).rejects.toThrow(/HTTP 401/);
        expect(calls).toHaveLength(1);
      },
    );
  });

  test('si la respuesta no cumple el esquema le devuelve el error a la IA para que lo corrija', async () => {
    await withMockProvider(
      (_c, call) => ({ status: 200, body: RESPONSES.ollama(call === 1 ? '{"respuesta": 42}' : '{"answer": "42"}') }),
      async (baseUrl, calls) => {
        const result = await client('ollama', baseUrl).completeJSON({ purpose: 'corrección', system: 's', user: 'u' }, Answer);
        expect(result.answer).toBe('42');
        expect(calls).toHaveLength(2);
        expect(JSON.stringify(calls[1].body)).toContain('rechazada');
      },
    );
  });
});
