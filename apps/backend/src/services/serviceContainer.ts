import { FirestoreRepository } from "../repositories/firestoreRepository.js";
import { EntitlementService } from "./entitlementService.js";
import { NotificationService } from "./notificationService.js";
import { OpenAiService } from "./openaiService.js";
import { RazorpayService } from "./razorpayService.js";
import { MetricsService } from "./metricsService.js";
import { MemoryService } from "./memoryService.js";

export interface ServiceContainer {
  repo: FirestoreRepository;
  entitlementService: EntitlementService;
  openAiService: OpenAiService;
  razorpayService: RazorpayService;
  notificationService: NotificationService;
  metricsService: MetricsService;
  memoryService: MemoryService;
}
