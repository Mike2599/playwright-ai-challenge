# Playwright + IA · Flujo de compra resiliente en SauceDemo

Solución al **Desafío Técnico: Automatización con Playwright e Integración de IA**.

Automatiza de principio a fin la compra en [SauceDemo](https://www.saucedemo.com) superando los tres obstáculos del reto:

| Obstáculo del reto | Cómo se provoca en la prueba | Cómo se supera |
|---|---|---|
| 1. Cambios deliberados en los selectores del DOM | `selectorChaos` renombra en cada carga todos los `data-test` (→ `data-qa` con sufijo aleatorio) y los `id` de los elementos de prueba | **Opción A**: selectores auto-reparables con IA |
| 2. Textos que varían pero deben mantener una intención | La intercepción de red cambia descripciones y el mensaje de confirmación por variantes aleatorias (español / inglés) | **Opción B**: `expectAI(texto, intención)` |
| 3. Datos de formulario sin valores *hardcoded* | — | **Opción C**: perfiles de cliente generados por la IA en tiempo real, validados por país |

Se implementaron las **tres** opciones de IA (el reto pide al menos dos), con **OpenAI, Anthropic u Ollama** intercambiables por configuración.

**Reporte de la ejecución de referencia, sin instalar nada:** [Allure](https://mike2599.github.io/playwright-ai-challenge/) · [HTML de Playwright](https://mike2599.github.io/playwright-ai-challenge/playwright/)

---

## Contenido

- [Stack](#stack)
- [Requisitos previos](#requisitos-previos)
- [Instalación y configuración](#instalación-y-configuración)
- [Ejecución](#ejecución)
- [Reportes y evidencias](#reportes-y-evidencias)
- [Opciones de IA implementadas](#opciones-de-ia-implementadas)
- [Capacidades avanzadas de Playwright](#capacidades-avanzadas-de-playwright)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Matriz de cumplimiento](#matriz-de-cumplimiento)
- [Decisiones sobre el enunciado](#decisiones-sobre-el-enunciado)
- [Resultados de la ejecución](#resultados-de-la-ejecución)

---

## Stack

| Herramienta | Versión | Uso |
|---|---|---|
| Node.js | ≥ 18 (probado con 20 y 24) | Runtime |
| TypeScript | 5.9 | Lenguaje |
| @playwright/test | 1.61.1 | Librería de pruebas **y** test runner |
| allure-playwright + allure-commandline | 3.11 / 2.46 | Reporte Allure |
| zod | 4 | Validación de configuración y de las respuestas de la IA |
| dotenv / cross-env | 16 / 7 | Variables de entorno multiplataforma |
| Proveedor de IA | OpenAI · Anthropic · Ollama | API REST (`fetch`), sin SDKs |

> Playwright 1.61 es la última versión compatible con Node 18, que es la versión mínima que exige el reto.

## Requisitos previos

| Requisito | Para qué | Comprobar |
|---|---|---|
| **Node.js 18 LTS o superior** + npm | Ejecutar las pruebas | `node -v` |
| **Java 21** (o cualquier JDK ≥ 8) | Solo para **generar** el reporte de Allure (`allure-commandline` corre sobre Java) | `java -version` |
| **Proveedor de IA** — una de estas opciones: | | |
| · API key de OpenAI | `AI_PROVIDER=openai` | |
| · API key de Anthropic | `AI_PROVIDER=anthropic` | |
| · [Ollama](https://ollama.com) en ejecución con un modelo descargado | `AI_PROVIDER=ollama` (sin API key) | `ollama pull llama3.1:8b` · `ollama list` |

> **Maven no es necesario.** El enunciado lo menciona junto a Java, pero el proyecto está en TypeScript y npm cumple el rol de gestor de dependencias y de build. Java solo se usa para el CLI de Allure. Ver [Decisiones sobre el enunciado](#decisiones-sobre-el-enunciado).

## Instalación y configuración

```bash
git clone <URL_DEL_REPOSITORIO>
cd playwright-ai-challenge
npm install
npx playwright install --with-deps
```

Copiar el archivo de entorno de ejemplo y completar las credenciales:

```bash
cp .env.example .env
```

```dotenv
AI_PROVIDER=openai          # openai | anthropic | ollama
AI_API_KEY=tu_api_key_aqui  # no se necesita con ollama
AI_MODEL=gpt-4o-mini        # o modelo equivalente; vacío = el modelo por defecto de cada proveedor
BASE_URL=https://www.saucedemo.com
```

[`.env.example`](.env.example) documenta todas las variables. `.env` está en `.gitignore` y nunca se sube al repositorio.

| Variable | Por defecto | Descripción |
|---|---|---|
| `AI_PROVIDER` | `openai` | `openai`, `anthropic` u `ollama` |
| `AI_API_KEY` | — | Obligatoria para `openai` y `anthropic` |
| `AI_MODEL` | `gpt-4o-mini` · `claude-haiku-5-5` · `llama3.1:8b` | Modelo según el proveedor |
| `AI_BASE_URL` | URL oficial de cada proveedor | Ollama remoto, proxy o API compatible con OpenAI |
| `AI_TIMEOUT_MS` / `AI_MAX_RETRIES` | `120000` / `2` | Tiempo máximo y reintentos (429, 5xx, red) por llamada |
| `BASE_URL` | `https://www.saucedemo.com` | Aplicación bajo prueba |
| `SAUCE_USERNAME` / `SAUCE_PASSWORD` | `standard_user` / `secret_sauce` | Credenciales públicas de demostración de SauceDemo |
| `SELF_HEALING_TIMEOUT_MS` | `3000` | Cuánto espera el localizador original antes de pedir ayuda a la IA |
| `SEMANTIC_CONFIDENCE_THRESHOLD` | `0.7` | Confianza mínima de la IA para aprobar un `expectAI` |
| `TEST_ENV` | `local` | Entorno de ejecución: carga `environments/<TEST_ENV>.env` |
| `BROWSERS` / `WORKERS` / `RETRIES` / `HEADLESS` | según el entorno | Sobrescriben los valores del entorno |
| `TEST_TIMEOUT_MS` | `600000` | Tiempo máximo por prueba (con un LLM local en CPU, súbelo) |
| `SESSION_TTL_MINUTES` | `120` | Vigencia del `storageState` (ver [Global setup](#capacidades-avanzadas-de-playwright)) |

Precedencia de la configuración: variables del proceso → `.env` → `environments/<TEST_ENV>.env`. Si algo falta o es inválido, la ejecución se detiene con un mensaje claro (validación con zod en [`config/env.ts`](config/env.ts)).

## Ejecución

```bash
npx playwright test                 # headless, todas las pruebas
npx playwright test --ui            # modo interfaz (UI Mode)
npx playwright show-report          # reporte HTML
```

### Por entorno

| Entorno | Archivo | Pensado para | Comando |
|---|---|---|---|
| `local` (por defecto) | [`environments/local.env`](environments/local.env) | Máquina del desarrollador / Ollama: 1 worker, sin reintentos, Chromium | `npm run test:local` |
| `ci` | [`environments/ci.env`](environments/ci.env) | Integración continua con IA en la nube: 2 workers, 2 reintentos, Chromium + Firefox + WebKit, `test.only` prohibido | `npm run test:ci` |

También se puede elegir el entorno con la variable: `TEST_ENV=ci npx playwright test`. En PowerShell: `$env:TEST_ENV="ci"; npx playwright test`.

### Por suite, navegador o proveedor

| Comando | Qué ejecuta |
|---|---|
| `npm run test:e2e` | Compra E2E con los tres obstáculos a la vez |
| `npm run test:healing` | Opción A · self-healing |
| `npm run test:semantic` | Opción B · aserciones semánticas |
| `npm run test:synthetic` | Opción C · datos sintéticos |
| `npm run test:network` | Intercepción de red |
| `npm run test:auth` | Global setup / storageState |
| `npm run test:providers` | Contrato de los adaptadores OpenAI / Anthropic / Ollama contra un servidor simulado (no gasta tokens) |
| `npm run test:cross-browser` | Todo en Chromium, Firefox y WebKit |
| `npm run test:headed` | Con el navegador visible |
| `npx cross-env AI_PROVIDER=ollama AI_MODEL=llama3.1:8b npx playwright test` | Cambiar de proveedor sin editar `.env` |
| `npm run typecheck` | Verificación de tipos (`tsc --noEmit`) |

## Reportes y evidencias

| Reporte | Comando | Contenido |
|---|---|---|
| **HTML de Playwright** | `npx playwright show-report` | Pasos, anotaciones de self-healing, adjuntos, trace, video y screenshot de los fallos |
| **Allure** | `npm run allure:serve` (o `allure:generate` + `allure:open`) | Epics/features/stories, severidad, pasos, categorías de fallo propias y entorno (proveedor, modelo, navegador) |
| **Resumen de uso de IA** | `.ai-logs/ai-usage-summary.json` | Llamadas por propósito, latencia, tokens, selectores reparados y aserciones semánticas |

Los reportes de la ejecución de referencia (27/27, Ollama `llama3.1:8b`) están publicados en GitHub Pages: **[Allure](https://mike2599.github.io/playwright-ai-challenge/)** y **[HTML de Playwright](https://mike2599.github.io/playwright-ai-challenge/playwright/)**. Ahí se pueden abrir los adjuntos de cada prueba sin clonar el proyecto.

**Peticiones y respuestas adjuntas a cada prueba** (en Allure y en el HTML):

| Adjunto | Contenido |
|---|---|
| `IA #n · <propósito> · petición y respuesta` | Petición HTTP exacta al proveedor (URL, headers **sin la API key**, body con el prompt) y respuesta completa (status, body, tokens, latencia, reintentos) |
| `network-traffic.json` | Todas las peticiones/respuestas de la página: método, URL, status, tiempos, headers y body de documentos y llamadas xhr/fetch |
| `network-interception.json` | Qué respuestas se interceptaron y cómo se modificaron |
| `self-healing · <elemento>` | Selector roto, selector reparado, contenedor analizado y cada candidato de la IA con su veredicto |
| `expectAI · veredicto` | Texto real, intención, lo que la IA detectó, su razonamiento y la confianza |
| `datos sintéticos · cliente XX` | Perfil generado y escenario pedido |

## Opciones de IA implementadas

Todas usan el mismo [`AIClient`](src/ai/AIClient.ts), que:
- traduce la petición al formato de cada proveedor ([`providers/`](src/ai/providers));
- pide **salida estructurada** con el JSON Schema generado desde zod: en Ollama como `format` (decodificación restringida), en OpenAI con el modo `json_object` más el esquema en el prompt, y en Anthropic dentro del prompt;
- valida la respuesta con zod y, si no cumple, **le devuelve el error a la IA** para que la corrija;
- reintenta ante 429, 5xx y errores de red, y repite sin `temperature` si el modelo no la admite.

### Opción A · Selectores auto-reparables — [`SelfHealingLocator`](src/healing/SelfHealingLocator.ts)

1. Intenta el localizador estándar (`[data-test="checkout"]`) durante `SELF_HEALING_TIMEOUT_MS`.
2. Si falla con **`TimeoutError`**, extrae el **DOM compacto y el árbol de accesibilidad del contenedor objetivo** (cada page object declara su contenedor; si tampoco existe, usa `<body>`).
3. Le pide al LLM hasta 3 candidatos CSS/XPath, ordenados por probabilidad.
4. Valida cada candidato **en la página real**: debe existir, ser único (o una lista, si así se declaró), ser visible y contener el texto esperado (`textHint`), lo que evita falsos positivos. Si un CSS falla solo por la etiqueta (p. ej. `button[...]` para un `<input type="submit">`), prueba el mismo selector sin la etiqueta.
5. Si ninguno sirve, hace otra ronda indicándole a la IA qué se rechazó y por qué.
6. Continúa la interacción con el selector reparado **sin detener la prueba**, lo guarda en caché para el resto de la prueba y deja evidencia en el reporte (anotación + adjunto + resumen global).

Todos los page objects ([`src/pages`](src/pages)) interactúan a través del healer, así que el mecanismo protege el flujo completo.

```bash
npm run test:healing
```

### Opción B · Aserciones semánticas — [`expectAI`](src/assertions/expectAI.ts)

```ts
await expectAI(textoOLocator, 'Confirma que la compra se completó y agradece al cliente, con tono positivo');
await expectAI.not(textoOLocator, 'Informa que el pago fue rechazado');
await expectAI(texto, intención, { threshold: 0.8, soft: true });
```

- Acepta un `string` o un `Locator` (usa su `innerText`).
- La IA devuelve, en este orden, `detectedIntent` → `reasoning` → `matches` → `confidence`: primero razona y después decide.
- Aprueba si `matches` coincide con lo esperado **y** `confidence ≥ SEMANTIC_CONFIDENCE_THRESHOLD`.
- Falla como cualquier `expect` de Playwright, con un mensaje que explica qué detectó la IA. Admite `.not` y modo `soft`.
- Las pruebas incluyen **controles negativos** (mensajes con la intención contraria o con tono descortés) para demostrar que la aserción también sabe decir que no.

```bash
npm run test:semantic
```

### Opción C · Datos sintéticos — [`SyntheticDataGenerator`](src/data/SyntheticDataGenerator.ts)

- Genera perfiles de cliente realistas para **Colombia, México, España, Estados Unidos, Brasil y Canadá**: nombre, apellido, email, teléfono con indicativo, ciudad, dirección, código postal e instrucciones de entrega según el escenario de negocio.
- No es determinista: usa temperatura 1, rango de edad aleatorio, un nonce, y le pasa a la IA los nombres ya usados (`customers(n)`) para no repetirlos.
- Valida cada perfil con las [reglas de formato de cada país](src/data/countries.ts) (código postal, indicativo, email, nombres solo con letras). Si algo no cumple, la IA lo corrige.
- No hay un solo valor fijo en el código: el checkout de **todas** las pruebas se diligencia con estos datos.

```bash
npm run test:synthetic
```

## Capacidades avanzadas de Playwright

| Capacidad | Dónde | Detalle |
|---|---|---|
| **Custom fixtures** | [`src/fixtures/index.ts`](src/fixtures/index.ts) | `test.extend` inyecta `ai` (cliente de IA encapsulado), `expectAI`, `healer`, `dataFactory`, `network`, `networkRecorder` (automático), los page objects y la opción `selectorChaos` (`test.use({ selectorChaos: true })`) |
| **Intercepción de red** | [`SauceDemoNetwork`](src/network/SauceDemoNetwork.ts) | SauceDemo no tiene API: su catálogo y sus textos llegan en el bundle JS, que actúa como respuesta del backend. Se intercepta con `page.route` + `route.fetch` y se **modifica en tiempo de ejecución** (precios, descripciones, mensajes). También **inyecta errores**: HTTP 503 en imágenes, cortes de red (`route.abort`) y latencia |
| **Global setup & teardown** | [`global-setup.ts`](src/setup/global-setup.ts) · [`global-teardown.ts`](src/setup/global-teardown.ts) | El setup comprueba el proveedor de IA (falla rápido y precarga el modelo), hace login **una sola vez** y guarda `.auth/storageState.json`, que todas las pruebas cargan vía `use.storageState`. El teardown consolida el uso de IA de todos los workers y elimina el estado de sesión |
| **Observabilidad** | [`playwright.config.ts`](playwright.config.ts) | `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`, `video: 'retain-on-failure'`, reporte HTML, Allure con categorías propias, y `list` en consola |

> **Sobre `storageState`:** SauceDemo crea la cookie `session-username` con una vida de solo 10 minutos y la valida únicamente en el navegador (no hay sesión en servidor). Como una ejecución completa con un LLM local supera esos 10 minutos, el global setup extiende la caducidad de esa cookie a `SESSION_TTL_MINUTES` dentro del estado guardado. Así el login se hace una sola vez por ejecución, como pide el reto.

## Estructura del proyecto

```
playwright-ai-challenge
├── playwright.config.ts          # Reporters, observabilidad, storageState, proyectos por navegador
├── config/env.ts                 # Carga y validación de .env + environments/<TEST_ENV>.env
├── environments/                 # local.env · ci.env
├── .env.example                  # Variables documentadas (sin secretos)
├── src
│   ├── ai/                       # AIClient + adaptadores openai/anthropic/ollama
│   ├── healing/                  # Opción A: SelfHealingLocator, captura de DOM, selectorChaos (obstáculo 1)
│   ├── assertions/               # Opción B: expectAI
│   ├── data/                     # Opción C: SyntheticDataGenerator, reglas por país, textos dinámicos (obstáculo 2)
│   ├── network/                  # Intercepción (SauceDemoNetwork) y captura de tráfico (NetworkRecorder)
│   ├── pages/                    # Page objects sobre el localizador auto-reparable
│   ├── fixtures/                 # test.extend con todos los fixtures
│   ├── setup/                    # Global setup y teardown
│   └── utils/
├── tests
│   ├── e2e/purchase.e2e.spec.ts              # Compra completa con los 3 obstáculos
│   ├── ai/self-healing.spec.ts               # Opción A
│   ├── ai/semantic-assertions.spec.ts        # Opción B
│   ├── ai/synthetic-data.spec.ts             # Opción C
│   ├── ai/providers.contract.spec.ts         # Contrato de los 3 proveedores de IA (servidor simulado)
│   ├── network/network-interception.spec.ts  # Modificación de respuestas y errores de red
│   └── auth/session.spec.ts                  # storageState
└── .github/workflows/playwright.yml          # CI a demanda con OpenAI o Anthropic + artefactos de reportes
```

## Matriz de cumplimiento

| Requisito del enunciado | Estado | Dónde |
|---|---|---|
| Flujo completo de compra E2E | ✅ | `tests/e2e/purchase.e2e.spec.ts` |
| Obstáculo 1: cambios deliberados en selectores | ✅ | `src/healing/selectorChaos.ts` + Opción A |
| Obstáculo 2: texto dinámico con intención semántica | ✅ | `src/data/dynamicCopy.ts` + intercepción + Opción B |
| Obstáculo 3: datos sintéticos sin hardcode | ✅ | Opción C, usada en todos los checkouts |
| TypeScript | ✅ | Todo el proyecto (`npm run typecheck`) |
| Custom fixtures (cliente de IA encapsulado, helper de aserciones, estado) | ✅ | `src/fixtures/index.ts` |
| Network interception: modificar respuestas | ✅ | `overrideProduct`, `replaceUiText` |
| Network interception: inyectar errores | ✅ | `failProductImages(503)`, `abortRequests`, `delayApplication` |
| Global setup & teardown con `storageState.json` | ✅ | `src/setup/*`, `use.storageState` |
| `trace: 'retain-on-failure'` | ✅ | `playwright.config.ts` |
| `screenshot: 'only-on-failure'` | ✅ | `playwright.config.ts` |
| `video: 'retain-on-failure'` | ✅ | `playwright.config.ts` |
| Reporte HTML detallado | ✅ | `playwright-report/` |
| LLM: OpenAI, Anthropic u Ollama (REST) | ✅ los tres | `src/ai/providers/` (+ pruebas de contrato) |
| Al menos 2 retos de IA | ✅ los 3 (A, B y C) | ver arriba |
| Node 18+, npm | ✅ | `engines.node >= 18` |
| `.env.example` con `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `BASE_URL` | ✅ | `.env.example` |
| `npx playwright test` · `--ui` · `show-report` | ✅ | — |
| Reporte Allure con peticiones/respuestas adjuntas | ✅ | `allure-playwright` + adjuntos |
| README: requisitos, comandos por entorno, `.env.example`, resumen de IA | ✅ | este archivo |
| Repositorio con historial de commits limpio | ✅ | un commit por componente |

## Decisiones sobre el enunciado

El enunciado tiene secciones que se contradicen. Estas son las decisiones tomadas:

| El enunciado dice | Se resolvió así | Por qué |
|---|---|---|
| "Lenguaje: Java 21", "JUnit 5 o TestNG", "Maven o Gradle" (tabla inicial) | **TypeScript + Playwright Test + npm** | La sección 2 exige explícitamente *"El proyecto debe estar desarrollado en TypeScript"*, y todo lo que pide (`test.extend`, `playwright.config.ts`, `globalSetup`, `--ui`, `npx playwright ...`, `.env` + Node 18) solo existe en Playwright para Node. En TypeScript el runner es Playwright Test, que cumple el papel de JUnit/TestNG |
| README con "Requisitos previos de instalación (Java 21, Maven)" | Se documenta **Java 21 para generar Allure** y se aclara que Maven no aplica | `allure-commandline` corre sobre Java; npm reemplaza a Maven |
| "Reporte: Allure Framework" | **Allure + reporte HTML de Playwright** | Allure lo exige la tabla de stack y el reporte HTML lo exige la sección 2 |
| `cd playwright-ai-challenge` | Ese es el nombre del repositorio | Coincide con las instrucciones |

## Resultados de la ejecución

Ejecución de referencia: Windows 11, Node 24, Chromium, **Ollama `llama3.1:8b` en CPU (sin GPU)**.

| Métrica | Resultado |
|---|---|
| Pruebas | **27 / 27 exitosas** (19,7 min) |
| Llamadas a la IA | 40 (0 fallidas) · 23 de self-healing, 9 de datos sintéticos, 8 de aserciones semánticas |
| Selectores reparados | 21, todos en la **primera** ronda de la IA |
| Aserciones semánticas | 8, todas con confianza 1,0 |
| Latencia media por llamada | ~27 s (CPU). Con un proveedor en la nube baja a segundos |

Verificaciones adicionales:
- **Firefox y WebKit**: sesión, red, contrato de proveedores y self-healing con el DOM alterado, todos en verde.
- **Estabilidad**: la suite de aserciones semánticas se repitió 3 veces seguidas (`--repeat-each 3`) sin fallos.
- **Node 18.20.8**: carga la configuración y las 27 pruebas (`playwright test --list`).
- **OpenAI y Anthropic**: verificados con las pruebas de contrato contra un servidor simulado (formato de petición, autenticación, parseo, reintentos y redacción de la API key). Para correr la suite contra el servicio real basta con poner la API key en `.env`.

### Limitaciones conocidas

- **Tiempo con un modelo local en CPU**: la compra E2E tarda entre 7,5 y 10 min porque cada reparación de selector es una llamada al LLM (17 en esa prueba). Por eso `TEST_TIMEOUT_MS` se puede configurar.
- **Modelos pequeños (8B)**: tienen dificultades para separar contenido y tono cuando un mismo texto mezcla una confirmación con una frase hostil. La prueba de tono compara el mismo contenido con dos tonos distintos, lo que el modelo sí evalúa de forma consistente. Durante el desarrollo también se observó que un modelo de 8B a veces llama `button` a un `<input type="submit">`; el healer lo resuelve con la corrección de etiqueta descrita en la Opción A.

## Licencia

[MIT](LICENSE)
