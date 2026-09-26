import { and, desc, eq, lte, isNull } from 'drizzle-orm';
import { db } from '../client';
import { paddleCustomers, paddleSubscriptions } from '../schema';
import type { PaddleBillingRepository } from '../../../ports/repositories.port';

export class DrizzlePaddleBillingRepository implements PaddleBillingRepository {
  async anonymizeCustomerForUser(userId: string): Promise<void> {
    await db.update(paddleCustomers)
      .set({ email: null, userId: null, anonymizedAt: new Date(), updatedAt: new Date() })
      .where(eq(paddleCustomers.userId, userId));
  }

  async findCustomerForUser(userId: string) {
    const [customer] = await db.select({ customerId: paddleCustomers.customerId })
      .from(paddleCustomers)
      .where(eq(paddleCustomers.userId, userId))
      .limit(1);
    if (!customer) return null;

    const subscriptions = await db.select({ subscriptionId: paddleSubscriptions.subscriptionId })
      .from(paddleSubscriptions)
      .where(eq(paddleSubscriptions.customerId, customer.customerId));

    return {
      customerId: customer.customerId,
      subscriptionIds: subscriptions.map((item) => item.subscriptionId),
    };
  }

  async attachCustomerToUser(input: { customerId: string; email: string; userId: string }): Promise<boolean> {
    const email = input.email.trim().toLowerCase();
    const attached = await db.insert(paddleCustomers).values({
      customerId: input.customerId,
      email,
      userId: input.userId,
    }).onConflictDoUpdate({
      target: paddleCustomers.customerId,
      set: { userId: input.userId, email, updatedAt: new Date() },
      setWhere: and(isNull(paddleCustomers.userId), isNull(paddleCustomers.anonymizedAt)),
    }).returning({ customerId: paddleCustomers.customerId });
    if (attached.length > 0) return true;
    const [existing] = await db.select({ userId: paddleCustomers.userId, anonymizedAt: paddleCustomers.anonymizedAt })
      .from(paddleCustomers).where(eq(paddleCustomers.customerId, input.customerId));
    return existing?.userId === input.userId && existing.anonymizedAt === null;
  }

  async listSubscriptionsForUser(userId: string) {
    return db.select({
      subscriptionId: paddleSubscriptions.subscriptionId,
      status: paddleSubscriptions.status,
      priceId: paddleSubscriptions.priceId,
      productId: paddleSubscriptions.productId,
      quantity: paddleSubscriptions.quantity,
      currentPeriodStart: paddleSubscriptions.currentPeriodStart,
      currentPeriodEnd: paddleSubscriptions.currentPeriodEnd,
      scheduledChangeAction: paddleSubscriptions.scheduledChangeAction,
      scheduledChangeAt: paddleSubscriptions.scheduledChangeAt,
      lastEventAt: paddleSubscriptions.lastEventAt,
    }).from(paddleSubscriptions)
      .innerJoin(paddleCustomers, eq(paddleSubscriptions.customerId, paddleCustomers.customerId))
      .where(eq(paddleCustomers.userId, userId))
      .orderBy(desc(paddleSubscriptions.lastEventAt));
  }

  async upsertCustomer(input: { customerId: string; email: string }): Promise<void> {
    const email = input.email.trim().toLowerCase();

    await db.insert(paddleCustomers).values({
      customerId: input.customerId,
      email,
    }).onConflictDoUpdate({
      target: paddleCustomers.customerId,
      set: { email, updatedAt: new Date() },
      // Enforced in the same write, so a delayed webhook or checkout upsert cannot race a
      // read-before-write check and restore identity after account erasure.
      setWhere: isNull(paddleCustomers.anonymizedAt),
    });
  }

  async upsertSubscription(input: Parameters<PaddleBillingRepository['upsertSubscription']>[0]): Promise<void> {
    await db.insert(paddleCustomers).values({ customerId: input.customerId })
      .onConflictDoNothing({ target: paddleCustomers.customerId });

    const values = {
      subscriptionId: input.subscriptionId,
      customerId: input.customerId,
      status: input.status,
      priceId: input.priceId,
      productId: input.productId,
      quantity: input.quantity,
      currentPeriodStart: input.currentPeriodStart,
      currentPeriodEnd: input.currentPeriodEnd,
      scheduledChangeAction: input.scheduledChangeAction,
      scheduledChangeAt: input.scheduledChangeAt,
      lastEventAt: input.occurredAt,
      updatedAt: new Date(),
    };

    const inserted = await db.insert(paddleSubscriptions).values(values)
      .onConflictDoNothing({ target: paddleSubscriptions.subscriptionId })
      .returning({ id: paddleSubscriptions.subscriptionId });

    if (inserted.length === 0) {
      await db.update(paddleSubscriptions).set(values).where(and(
        eq(paddleSubscriptions.subscriptionId, input.subscriptionId),
        lte(paddleSubscriptions.lastEventAt, input.occurredAt),
      ));
    }
  }
}
