import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { env } from "./config/env.js";
import { registerV1Routes } from "./routes/v1.js";
import { FirestoreRepository } from "./repositories/firestoreRepository.js";
import { EntitlementService } from "./services/entitlementService.js";
import { NotificationService } from "./services/notificationService.js";
import { OpenAiService } from "./services/openaiService.js";
import { RazorpayService } from "./services/razorpayService.js";
import { getFirestore } from "./services/firebase.js";
import { AppError } from "./utils/errors.js";
import { MetricsService } from "./services/metricsService.js";
import { MemoryService } from "./services/memoryService.js";
import { randomUUID } from "node:crypto";

const app = Fastify({
  logger: {
    level: env.NODE_ENV === "production" ? "info" : "debug"
  }
});

await app.register(cors, {
  origin: env.ALLOWED_ORIGIN === "*" ? true : env.ALLOWED_ORIGIN,
  credentials: true
});
await app.register(helmet);

const repo = new FirestoreRepository(getFirestore());
const services = {
  repo,
  entitlementService: new EntitlementService(),
  openAiService: new OpenAiService(),
  razorpayService: new RazorpayService(),
  notificationService: new NotificationService(repo),
  metricsService: new MetricsService(),
  memoryService: new MemoryService(repo)
};

app.addHook("onRequest", async (request, reply) => {
  const requestId = request.headers["x-request-id"]?.toString() ?? randomUUID();
  reply.header("x-request-id", requestId);
  services.metricsService.increment("requests_total");
});

app.get("/health", async () => ({ ok: true, service: "antar-backend" }));
app.get("/metrics", async () => ({ ok: true, counters: services.metricsService.snapshot() }));
await registerV1Routes(app, services);

app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, "request_failed");

  if (error instanceof AppError) {
    services.metricsService.increment(`errors_${error.code.toLowerCase()}`);
    return reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        details: error.details ?? null
      }
    });
  }

  services.metricsService.increment("errors_internal_error");
  return reply.status(500).send({
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong"
    }
  });
});

const start = async () => {
  try {
    await app.listen({ host: "0.0.0.0", port: env.PORT });
    app.log.info(`antar-backend running on :${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

await start();
