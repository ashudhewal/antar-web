import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(8080),
  ALLOWED_ORIGIN: z.string().default("https://www.getlatent.ai"),

  FIREBASE_PROJECT_ID: z.string(),
  FIREBASE_CLIENT_EMAIL: z.string(),
  FIREBASE_PRIVATE_KEY: z.string(),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_REALTIME_MODEL: z.string().default("gpt-realtime"),
  OPENAI_REALTIME_VOICE: z.string().default("sage"),
  OPENAI_SUMMARY_MODEL: z.string().default("gpt-4o-mini"),

  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAY_WEEKLY_AMOUNT_PAISE: z.coerce.number().default(10000),
  INTERNAL_JOB_TOKEN: z.string().optional(),

  DEFAULT_TIMEZONE: z.string().default("Asia/Kolkata"),
  TRIAL_TOTAL_SECONDS: z.coerce.number().default(300),
  PAID_DAILY_SECONDS: z.coerce.number().default(600),
  PAST_DUE_GRACE_HOURS: z.coerce.number().default(24)
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast for deploy-time configuration issues.
  throw new Error(`Invalid environment: ${parsed.error.message}`);
}

export const env = {
  ...parsed.data,
  FIREBASE_PRIVATE_KEY: parsed.data.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
};
