import { FirestoreRepository } from "../repositories/firestoreRepository.js";
import { getFirebaseApp } from "./firebase.js";

export class NotificationService {
  constructor(private readonly repo: FirestoreRepository) {}

  async enqueueRenewalFailedNotification(uid: string): Promise<void> {
    await this.sendToUser(uid, "Payment Issue", "Your weekly plan renewal failed. Please update payment to continue.");
  }

  async enqueuePaymentRecoveredNotification(uid: string): Promise<void> {
    await this.sendToUser(uid, "Plan Active", "Your Antar weekly plan is active again.");
  }

  async sendDailyReminder(uid: string): Promise<void> {
    await this.sendToUser(uid, "Antar Reminder", "Krishna is available whenever you need calm and guidance.");
  }

  private async sendToUser(uid: string, title: string, body: string): Promise<void> {
    const user = await this.repo.getUser(uid);
    if (!user?.notificationToken || !user.reminderEnabled) return;

    await getFirebaseApp().messaging().send({
      token: user.notificationToken,
      notification: { title, body },
      data: {
        uid,
        source: "antar-backend"
      }
    });
  }
}
