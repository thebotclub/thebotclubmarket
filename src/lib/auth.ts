import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { EncryptedPrismaAdapter } from "./encrypted-adapter";
import { db } from "./db";
import { WELCOME_BONUS_CREDITS } from "./constants";
import { trackServerEvent } from "./posthog";

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  adapter: EncryptedPrismaAdapter(db),
  providers: [GitHub, Google],
  pages: {
    signIn: "/login",
  },
  session: {
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (!user.id) return;
      // Grant welcome bonus — only if no ledger entries exist yet
      const existing = await db.creditTransaction.count({
        where: { operatorId: user.id },
      });
      if (existing === 0) {
        await db.$transaction([
          db.operator.update({
            where: { id: user.id },
            data: { creditBalance: { increment: WELCOME_BONUS_CREDITS } },
          }),
          db.creditTransaction.create({
            data: {
              amount: WELCOME_BONUS_CREDITS,
              type: "BONUS",
              description: "Welcome bonus credits",
              operatorId: user.id,
            },
          }),
          db.ledger.create({
            data: {
              type: "CREDIT_PURCHASE",
              amount: WELCOME_BONUS_CREDITS,
              description: "Welcome bonus",
              operatorId: user.id,
            },
          }),
        ]);
      }
      // Track signup event
      trackServerEvent(user.id, "signup", {
        userId: user.id,
        email: user.email,
      });
    },
  },
});
