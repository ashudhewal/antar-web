import { FastifyReply, FastifyRequest } from "fastify";
import { getAuth } from "../services/firebase.js";
import { unauthorized } from "../utils/errors.js";

export const firebaseAuthMiddleware = async (request: FastifyRequest, _reply: FastifyReply) => {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw unauthorized("Missing bearer token");
  }

  const token = authHeader.replace("Bearer ", "").trim();
  try {
    const decoded = await getAuth().verifyIdToken(token);
    request.authUser = {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name
    };
  } catch {
    throw unauthorized("Invalid Firebase ID token");
  }
};
