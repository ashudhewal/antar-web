import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    authUser?: {
      uid: string;
      email?: string;
      name?: string;
    };
  }
}
