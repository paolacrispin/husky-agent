# Maki — Instrucciones de proyecto para Claude Code

Maki es un agente de IA tipo terminal que interpreta instrucciones en lenguaje natural
("envía X a Y", "haz swap de A a B") para operaciones DeFi cotidianas en HashKey Chain
Testnet. Este archivo es el punto de entrada — léelo siempre primero. Los detalles de
cada dominio viven en `docs/`, cárgalos según la tarea:

| Tarea en la que estás trabajando | Lee |
|---|---|
| Entender el problema, el pitch, los criterios de juicio | `docs/00-vision.md` |
| Tocar cualquier parte del pipeline (interpretar→enviar) | `docs/01-architecture.md` |
| Escribir/editar contratos Solidity (AMM) | `docs/02-contracts-spec.md` |
| Tocar las tools que el LLM puede invocar | `docs/03-agent-tools-spec.md` |
| Tocar el motor de políticas o el resumen determinístico | `docs/04-security-policy-spec.md` |
| Tocar firma, transporte, Ledger/Speculos | `docs/05-signing-spec.md` |
| Tocar estructura del repo, scripts, env vars | `docs/06-repo-and-tooling.md` |
| Preparar o validar la demo | `docs/07-demo-script.md` |
| Datos específicos de HashKey Chain (RPC, chain ID, docs oficiales) | `skill.md` (ya existente, no tocar sin confirmar) |

## Principio no negociable

**El LLM nunca firma ni construye calldata.** El modelo solo interpreta intención y
elige qué tool invocar con qué parámetros extraídos del lenguaje natural. Todo lo demás
—resolución de direcciones, construcción de transacciones, chequeo de política, firma—
es código determinístico, sin LLM en el loop. Si una tarea requiere que el LLM "decida"
un monto, una dirección o un parámetro de transacción sin que haya pasado por el
resolver determinístico, detente y pregunta antes de implementarlo así.

## Alcance de v1 (hackathon) — no negociable salvo instrucción explícita

- Operaciones soportadas: **transferencia de tokens** y **swap** (vía el AMM propio).
  Nada más (no lending, no staking, no NFTs, no multi-step composability).
- Una sola chain: **HashKey Chain Testnet (chain ID 133)**. No multi-chain.
- Firma: **solo Ledger vía Speculos** (emulador). No Secure Enclave, no otros signers.
- Sin World AgentKit ni ninguna capa de "prueba de humanidad". Fuera de alcance.
- Aprobación humana: **siempre requerida**, sin excepciones ni umbrales de
  auto-aprobación. No implementes lógica de auto-aprobación aunque parezca una mejora
  razonable — es una decisión de producto explícita, no un descuido.
- Resolución de direcciones: contactos locales (`contacts.json`) primero, con fallback
  a una dirección `0x...` pasada directamente. No implementes ENS ni ningún resolver
  externo.
- Feedback de UX vía Flashblocks de HSK testnet (preconfirmaciones ~200ms por
  websocket) sí está en alcance, como capa de UX aislada del pipeline de seguridad
  (ver `01-architecture.md`). Regla dura: el estado "preconfirmado" nunca se presenta
  como equivalente a "confirmado/final" — deben ser visual y textualmente distintos en
  toda la UI.

## No-goals explícitos (para evitar scope creep)

- World AgentKit / prueba de humanidad — cortado del proyecto.
- Account Abstraction (ERC-4337) — descartado por falta de bundler confiable en HSK
  testnet (ver `docs/00-vision.md` para el detalle de la investigación).
- Cualquier chain que no sea HashKey Chain Testnet.
- Auto-aprobación de transacciones bajo cualquier umbral.
- Hardware wallet físico — el proyecto usa Speculos exclusivamente; el código de firma
  debe estar escrito de forma que apuntar a un Ledger físico sea un cambio de
  configuración de transporte, no de lógica (ver `docs/05-signing-spec.md`).

## Convenciones

- TypeScript estricto (`strict: true`) en todo el código del agente/wallet.
- Contratos en Solidity con Foundry (ver `docs/02-contracts-spec.md`).
- Cualquier función que reciba un monto o una dirección proveniente del LLM debe
  validarse con un schema (zod o similar) antes de tocar el resolver.
- No commitear claves privadas ni mnemonics reales. Solo el mnemonic de testnet
  documentado en `docs/05-signing-spec.md`.
- Antes de dar por terminada una tarea que toque el motor de políticas o la firma,
  señala explícitamente qué se probó y qué no — ese código es el de mayor riesgo del
  proyecto.
