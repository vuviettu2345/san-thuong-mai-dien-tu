import { db } from "./db";
import { eq, and, desc, sql, like, or, count, sum, gte, lte, lt, isNull, ne, asc } from "drizzle-orm";
import {
  users,
  sellers,
  products,
  productItems,
  files,
  orders,
  walletTransactions,
  withdrawals,
  deposits,
  adminLogs,
  conversations,
  messages,
  reviews,
  systemSettings,
  notificationSettings,
  notifications,
  referrals,
  userReferralCodes,
  flashSales,
  flashSaleProducts,
  wishlists,
  bundles,
  bundleItems,
  telegramSettings,
  warranties,
  warrantyClaims,
  disputes,
  pricingSuggestions,
  adminBroadcasts,
  pendingEarnings,
  type User,
  type UpsertUser,
  type Seller,
  type InsertSeller,
  type Product,
  type InsertProduct,
  type ProductItem,
  type InsertProductItem,
  type Order,
  type InsertOrder,
  type WalletTransaction,
  type InsertWalletTransaction,
  type Withdrawal,
  type InsertWithdrawal,
  type Deposit,
  type InsertDeposit,
  type AdminLog,
  type InsertAdminLog,
  type File as FileRecord,
  type InsertFile,
  type Conversation,
  type InsertConversation,
  type Message,
  type InsertMessage,
  type Review,
  type InsertReview,
  type NotificationSettings,
  type InsertNotificationSettings,
  type Notification,
  type InsertNotification,
  type Referral,
  type InsertReferral,
  type UserReferralCode,
  type InsertUserReferralCode,
  type FlashSale,
  type InsertFlashSale,
  type FlashSaleProduct,
  type InsertFlashSaleProduct,
  type Wishlist,
  type InsertWishlist,
  type Bundle,
  type InsertBundle,
  type BundleItem,
  type InsertBundleItem,
  type TelegramSettings,
  type InsertTelegramSettings,
  type Warranty,
  type InsertWarranty,
  type WarrantyClaim,
  type InsertWarrantyClaim,
  type Dispute,
  type InsertDispute,
  type PricingSuggestion,
  type InsertPricingSuggestion,
  type AdminBroadcast,
  type InsertAdminBroadcast,
  type PendingEarning,
  type InsertPendingEarning,
} from "@shared/schema";
import crypto from "crypto";

// Helper function to get platform logo
function getPlatformLogoUrl(platform?: string | null): string | null {
  if (!platform) return null;
  const logoMap: Record<string, string> = {
    facebook: "/platform-logos/facebook.png",
    gmail: "/platform-logos/gmail.png",
    tiktok: "/platform-logos/tiktok.jpg",
    instagram: "/platform-logos/instagram.jpg",
    zalo: "/platform-logos/zalo.jpg",
    capcut: "/platform-logos/capcut.jpg",
    telegram: "/platform-logos/telegram.png",
    twitter: "/platform-logos/twitter.png",
    youtube: "/platform-logos/youtube.jpg",
    discord: "/platform-logos/discord.png",
  };
  return logoMap[platform.toLowerCase()] || null;
}

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(userData: { email: string; password: string; firstName: string; lastName?: string | null }): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserRole(id: string, role: "buyer" | "seller" | "admin"): Promise<User>;
  updateUserBalance(id: string, amount: string): Promise<User>;
  updateUserStatus(id: string, status: "active" | "banned" | "pending"): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User>;
  deleteUser(id: string): Promise<void>;

  // Sellers
  getSeller(id: string): Promise<Seller | undefined>;
  getSellerWithUser(id: string): Promise<(Seller & { user: User }) | undefined>;
  createSeller(seller: InsertSeller): Promise<Seller>;
  updateSellerKycStatus(id: string, status: "pending" | "approved" | "rejected"): Promise<Seller>;
  getPendingKycSellers(): Promise<(Seller & { user: User })[]>;

  // Products
  getProduct(id: string): Promise<Product | undefined>;
  getProductWithSeller(id: string): Promise<(Product & { seller: User }) | undefined>;
  getProducts(filters?: { category?: string; platform?: string; status?: string; sellerId?: string }): Promise<(Product & { seller: User })[]>;
  getAllProductsAdmin(): Promise<(Product & { seller: User })[]>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProductStatus(id: string, status: "draft" | "pending_approval" | "active" | "disabled"): Promise<Product>;
  updateProductStock(id: string, stock: number): Promise<Product>;
  updateProductAdmin(id: string, data: Partial<Product>): Promise<Product>;
  updateProductPin(id: string, isPinned: boolean): Promise<Product>;
  getPendingProducts(): Promise<(Product & { seller: User })[]>;
  getSellerProducts(sellerId: string): Promise<Product[]>;
  deleteProduct(id: string): Promise<void>;
  deleteProductWithRelations(productId: string): Promise<void>;
  cleanupExpiredReservations(): Promise<number>;
  cancelExpiredPendingOrders(): Promise<number>;
  productHasOrders(productId: string): Promise<boolean>;

  // Product Items
  getProductItem(id: string): Promise<ProductItem | undefined>;
  getProductItems(productId: string): Promise<ProductItem[]>;
  getAvailableProductItem(productId: string): Promise<ProductItem | undefined>;
  getAvailableProductItems(productId: string, count: number): Promise<ProductItem[]>;
  createProductItems(items: InsertProductItem[]): Promise<ProductItem[]>;
  updateProductItemStatus(id: string, status: "available" | "reserved" | "sold"): Promise<ProductItem>;
  reserveProductItem(id: string, reservedUntil: Date): Promise<ProductItem>;
  checkDuplicateUid(uidHash: string): Promise<boolean>;

  // Orders
  getOrder(id: string): Promise<Order | undefined>;
  getOrderWithDetails(id: string): Promise<(Order & { product: Product; buyer: User; seller: User; productItem?: ProductItem }) | undefined>;
  getBuyerOrders(buyerId: string): Promise<(Order & { product: Product })[]>;
  getSellerOrders(sellerId: string): Promise<(Order & { product: Product })[]>;
  getPendingOrders(): Promise<(Order & { product: Product; buyer: User })[]>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrderStatus(id: string, status: "pending_payment" | "paid" | "cancelled" | "refunded"): Promise<Order>;
  updateOrderDeliveredContent(id: string, content: string): Promise<Order>;

  // Wallet Transactions
  createWalletTransaction(transaction: InsertWalletTransaction): Promise<WalletTransaction>;
  getUserTransactions(userId: string): Promise<WalletTransaction[]>;

  // Withdrawals
  getWithdrawal(id: string): Promise<Withdrawal | undefined>;
  getWithdrawalWithSeller(id: string): Promise<(Withdrawal & { seller: User }) | undefined>;
  getPendingWithdrawals(): Promise<(Withdrawal & { seller: User })[]>;
  getSellerWithdrawals(sellerId: string): Promise<Withdrawal[]>;
  createWithdrawal(withdrawal: InsertWithdrawal): Promise<Withdrawal>;
  updateWithdrawalStatus(id: string, status: "pending" | "approved" | "completed" | "rejected"): Promise<Withdrawal>;

  // Files
  createFile(file: InsertFile): Promise<FileRecord>;
  getProductFiles(productId: string): Promise<FileRecord[]>;

  // Deposits
  createDeposit(deposit: InsertDeposit): Promise<Deposit>;
  getDeposit(id: string): Promise<Deposit | undefined>;
  getDepositWithUser(id: string): Promise<(Deposit & { user: User }) | undefined>;
  getUserDeposits(userId: string): Promise<Deposit[]>;
  getPendingDeposits(): Promise<(Deposit & { user: User })[]>;
  updateDepositStatus(id: string, status: "pending" | "approved" | "rejected", adminNote?: string): Promise<Deposit>;

  // Admin Logs
  createAdminLog(log: InsertAdminLog): Promise<AdminLog>;

  // System Settings
  getSystemSetting(key: string): Promise<string | undefined>;
  getAllSystemSettings(): Promise<Record<string, string>>;
  updateSystemSetting(key: string, value: string, description?: string): Promise<void>;

  // Conversations & Messages
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | undefined>;
  getUserConversations(userId: string): Promise<(Conversation & { participant1: User; participant2: User; lastMessage?: Message })[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  getConversationMessages(conversationId: string): Promise<(Message & { sender: User })[]>;
  markMessagesAsRead(conversationId: string, userId: string): Promise<void>;
  getUnreadMessageCount(userId: string): Promise<number>;
  getOrCreateAdminConversation(userId: string, adminId: string): Promise<Conversation>;

  // Reviews
  createReview(review: InsertReview): Promise<Review>;
  getReview(id: string): Promise<Review | undefined>;
  getSellerReviews(sellerId: string): Promise<(Review & { buyer: User; order: Order })[]>;
  getAllReviews(): Promise<(Review & { buyer: User; seller: User; order: Order })[]>;
  updateReviewVisibility(id: string, isVisible: boolean): Promise<Review>;
  getOrderReview(orderId: string): Promise<Review | undefined>;

  // Notification Settings
  getNotificationSettings(userId: string): Promise<NotificationSettings | undefined>;
  createNotificationSettings(settings: InsertNotificationSettings): Promise<NotificationSettings>;
  updateNotificationSettings(userId: string, settings: Partial<NotificationSettings>): Promise<NotificationSettings>;
  getOrCreateNotificationSettings(userId: string): Promise<NotificationSettings>;

  // Notifications
  createNotification(notification: InsertNotification): Promise<Notification>;
  getUserNotifications(userId: string): Promise<Notification[]>;
  getUnreadNotificationsCount(userId: string): Promise<number>;
  markNotificationAsRead(id: string): Promise<Notification>;
  markAllNotificationsAsRead(userId: string): Promise<void>;
  deleteNotification(id: string): Promise<void>;
  clearAllNotifications(userId: string): Promise<void>;

  // Stats
  getAdminStats(): Promise<{
    totalUsers: number;
    totalSellers: number;
    totalProducts: number;
    totalOrders: number;
    totalRevenue: number;
    pendingKyc: number;
    pendingProducts: number;
    pendingOrders: number;
    pendingWithdrawals: number;
    pendingDeposits: number;
  }>;

  // Referrals
  getUserReferralCode(userId: string): Promise<UserReferralCode | undefined>;
  createUserReferralCode(data: InsertUserReferralCode): Promise<UserReferralCode>;
  getReferralByCode(code: string): Promise<UserReferralCode | undefined>;
  createReferral(data: InsertReferral): Promise<Referral>;
  getUserReferrals(userId: string): Promise<(Referral & { referred: User })[]>;
  getReferralByReferredId(referredId: string): Promise<Referral | undefined>;
  updateReferralEarnings(referralId: string, amount: string): Promise<void>;
  updateUserReferralCodeStats(userId: string, earnings: string): Promise<void>;
  updateReferrerTotalEarnings(userId: string, earnings: string): Promise<void>;
  incrementReferralCount(userId: string): Promise<void>;
  creditUserWallet(userId: string, amount: string): Promise<void>;

  // Flash Sales
  createFlashSale(data: InsertFlashSale): Promise<FlashSale>;
  getFlashSale(id: string): Promise<FlashSale | undefined>;
  getActiveFlashSales(): Promise<FlashSale[]>;
  getAllFlashSales(): Promise<FlashSale[]>;
  updateFlashSale(id: string, data: Partial<FlashSale>): Promise<FlashSale>;
  deleteFlashSale(id: string): Promise<void>;
  addFlashSaleProduct(data: InsertFlashSaleProduct): Promise<FlashSaleProduct>;
  getFlashSaleProducts(flashSaleId: string): Promise<(FlashSaleProduct & { product: Product })[]>;
  removeFlashSaleProduct(id: string): Promise<void>;
  getProductFlashSale(productId: string): Promise<(FlashSaleProduct & { flashSale: FlashSale }) | undefined>;

  // Wishlists
  addToWishlist(data: InsertWishlist): Promise<Wishlist>;
  removeFromWishlist(userId: string, productId: string): Promise<void>;
  getUserWishlist(userId: string): Promise<(Wishlist & { product: Product })[]>;
  isInWishlist(userId: string, productId: string): Promise<boolean>;
  getWishlistUsersForProduct(productId: string): Promise<Wishlist[]>;

  // Bundles
  createBundle(data: InsertBundle): Promise<Bundle>;
  getBundle(id: string): Promise<Bundle | undefined>;
  getBundleWithItems(id: string): Promise<(Bundle & { items: (BundleItem & { product: Product })[] }) | undefined>;
  getSellerBundles(sellerId: string): Promise<Bundle[]>;
  getAllBundles(): Promise<(Bundle & { seller: User })[]>;
  updateBundle(id: string, data: Partial<Bundle>): Promise<Bundle>;
  deleteBundle(id: string): Promise<void>;
  addBundleItem(data: InsertBundleItem): Promise<BundleItem>;
  removeBundleItem(id: string): Promise<void>;

  // Telegram Settings
  getTelegramSettings(userId: string): Promise<TelegramSettings | undefined>;
  createTelegramSettings(data: InsertTelegramSettings): Promise<TelegramSettings>;
  updateTelegramSettings(userId: string, data: Partial<TelegramSettings>): Promise<TelegramSettings>;
  getTelegramSettingsByChatId(chatId: string): Promise<TelegramSettings | undefined>;
  getVerifiedTelegramUsers(): Promise<TelegramSettings[]>;

  // Warranties
  createWarranty(data: InsertWarranty): Promise<Warranty>;
  getWarranty(id: string): Promise<Warranty | undefined>;
  getOrderWarranty(orderId: string): Promise<Warranty | undefined>;
  getUserWarranties(userId: string): Promise<(Warranty & { product: Product; order: Order })[]>;
  getSellerWarranties(sellerId: string): Promise<(Warranty & { product: Product; buyer: User })[]>;
  updateWarrantyStatus(id: string, status: "active" | "claimed" | "expired" | "void"): Promise<Warranty>;

  // Warranty Claims
  createWarrantyClaim(data: InsertWarrantyClaim): Promise<WarrantyClaim>;
  getWarrantyClaim(id: string): Promise<WarrantyClaim | undefined>;
  getWarrantyClaimWithDetails(id: string): Promise<(WarrantyClaim & { warranty: Warranty; buyer: User }) | undefined>;
  getPendingWarrantyClaims(): Promise<(WarrantyClaim & { warranty: Warranty; buyer: User })[]>;
  updateWarrantyClaimStatus(id: string, status: "pending" | "approved" | "rejected" | "processing", resolution?: string): Promise<WarrantyClaim>;

  // Disputes
  createDispute(data: InsertDispute): Promise<Dispute>;
  getDispute(id: string): Promise<Dispute | undefined>;
  getDisputeWithDetails(id: string): Promise<(Dispute & { order: Order; buyer: User; seller: User }) | undefined>;
  getOrderDispute(orderId: string): Promise<Dispute | undefined>;
  getAllDisputes(): Promise<(Dispute & { order: Order; buyer: User; seller: User })[]>;
  updateDispute(id: string, data: Partial<Dispute>): Promise<Dispute>;
  updateDisputeStatus(id: string, status: "open" | "investigating" | "resolved_buyer" | "resolved_seller" | "closed", resolution?: string): Promise<Dispute>;

  // Pricing Suggestions
  createPricingSuggestion(data: InsertPricingSuggestion): Promise<PricingSuggestion>;
  getProductPricingSuggestion(productId: string): Promise<PricingSuggestion | undefined>;
  getPricingSuggestionsForPlatform(platform: string): Promise<{ minPrice: string; maxPrice: string; avgPrice: string; count: number }>;

  // Seller Analytics
  getSellerAnalytics(sellerId: string): Promise<{
    totalSales: number;
    totalRevenue: string;
    totalOrders: number;
    averageOrderValue: string;
    topProducts: { productId: string; title: string; sales: number; revenue: string }[];
    monthlySales: { month: string; sales: number; revenue: string }[];
  }>;

  // User Activity
  updateUserLastSeen(userId: string): Promise<void>;
  getActiveUsers(): Promise<User[]>;

  // Admin Broadcasts
  createAdminBroadcast(data: InsertAdminBroadcast): Promise<AdminBroadcast>;
  getActiveAdminBroadcasts(): Promise<AdminBroadcast[]>;
  getAllAdminBroadcasts(): Promise<AdminBroadcast[]>;
  updateAdminBroadcast(id: string, data: Partial<AdminBroadcast>): Promise<AdminBroadcast>;
  deleteAdminBroadcast(id: string): Promise<void>;

  // Conversation Unread Counts
  getConversationUnreadCount(conversationId: string, userId: string): Promise<number>;

  // Pending Earnings
  createPendingEarning(data: InsertPendingEarning): Promise<PendingEarning>;
  getPendingEarningById(id: string): Promise<PendingEarning | undefined>;
  getPendingEarningsBySellerld(sellerId: string): Promise<PendingEarning[]>;
  getAllPendingEarnings(): Promise<PendingEarning[]>;
  getReleasablePendingEarnings(): Promise<PendingEarning[]>;
  updatePendingEarning(id: string, data: Partial<PendingEarning>): Promise<PendingEarning>;
  releasePendingEarning(id: string, adminNote?: string): Promise<PendingEarning>;
  cancelPendingEarning(id: string, adminNote?: string): Promise<PendingEarning>;
  getSellerPendingBalance(sellerId: string): Promise<string>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(userData: { email: string; password: string; firstName: string; lastName?: string | null }): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        email: userData.email,
        password: userData.password,
        firstName: userData.firstName,
        lastName: userData.lastName || null,
      })
      .returning();
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async updateUserRole(id: string, role: "buyer" | "seller" | "admin"): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserBalance(id: string, amount: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ walletBalance: amount, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async checkAdminExists(): Promise<boolean> {
    const [result] = await db
      .select({ count: count() })
      .from(users)
      .where(eq(users.role, "admin"));
    return (result?.count || 0) > 0;
  }

  // Sellers
  async getSeller(id: string): Promise<Seller | undefined> {
    const [seller] = await db.select().from(sellers).where(eq(sellers.id, id));
    return seller;
  }

  async getSellerWithUser(id: string): Promise<(Seller & { user: User }) | undefined> {
    const result = await db
      .select()
      .from(sellers)
      .innerJoin(users, eq(sellers.id, users.id))
      .where(eq(sellers.id, id));
    
    if (result.length === 0) return undefined;
    return { ...result[0].sellers, user: result[0].users };
  }

  async createSeller(sellerData: InsertSeller): Promise<Seller> {
    const [seller] = await db.insert(sellers).values(sellerData).returning();
    return seller;
  }

  async updateSellerKycStatus(id: string, status: "pending" | "approved" | "rejected"): Promise<Seller> {
    const [seller] = await db
      .update(sellers)
      .set({ kycStatus: status })
      .where(eq(sellers.id, id))
      .returning();
    return seller;
  }

  async getPendingKycSellers(): Promise<(Seller & { user: User })[]> {
    const result = await db
      .select()
      .from(sellers)
      .innerJoin(users, eq(sellers.id, users.id))
      .where(eq(sellers.kycStatus, "pending"))
      .orderBy(desc(sellers.createdAt));
    
    return result.map((r) => ({ ...r.sellers, user: r.users }));
  }

  // Products
  async getProduct(id: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    if (product && !product.thumbnailUrl) {
      product.thumbnailUrl = getPlatformLogoUrl(product.platform) || null;
    }
    return product;
  }

  async getProductWithSeller(id: string): Promise<(Product & { seller: User }) | undefined> {
    const result = await db
      .select()
      .from(products)
      .innerJoin(users, eq(products.sellerId, users.id))
      .where(eq(products.id, id));
    
    if (result.length === 0) return undefined;
    const product = result[0].products;
    if (!product.thumbnailUrl) {
      product.thumbnailUrl = getPlatformLogoUrl(product.platform) || null;
    }
    return { ...product, seller: result[0].users };
  }

  async getProducts(filters?: { category?: string; platform?: string; status?: string; sellerId?: string }): Promise<(Product & { seller: User })[]> {
    let query = db
      .select()
      .from(products)
      .innerJoin(users, eq(products.sellerId, users.id));

    const conditions: any[] = [eq(products.status, "active")];

    if (filters?.category && filters.category !== "all") {
      conditions.push(eq(products.category, filters.category as any));
    }
    if (filters?.platform && filters.platform !== "all") {
      conditions.push(eq(products.platform, filters.platform));
    }
    if (filters?.sellerId) {
      conditions.push(eq(products.sellerId, filters.sellerId));
    }
    if (filters?.status) {
      conditions.pop(); // Remove default active filter
      conditions.push(eq(products.status, filters.status as any));
    }

    const result = await query
      .where(and(...conditions))
      .orderBy(desc(products.isPinned), desc(products.pinnedAt), desc(products.createdAt));

    return result.map((r) => {
      const product = r.products;
      if (!product.thumbnailUrl) {
        product.thumbnailUrl = getPlatformLogoUrl(product.platform) || null;
      }
      return { ...product, seller: r.users };
    });
  }

  async createProduct(productData: InsertProduct): Promise<Product> {
    const [product] = await db.insert(products).values(productData).returning();
    return product;
  }

  async updateProductStatus(id: string, status: "draft" | "pending_approval" | "active" | "disabled"): Promise<Product> {
    const [product] = await db
      .update(products)
      .set({ status, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    return product;
  }

  async updateProductStock(id: string, stock: number): Promise<Product> {
    const [product] = await db
      .update(products)
      .set({ stock, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    return product;
  }

  async getAllProductsAdmin(): Promise<(Product & { seller: User })[]> {
    const result = await db
      .select()
      .from(products)
      .innerJoin(users, eq(products.sellerId, users.id))
      .orderBy(desc(products.isPinned), desc(products.pinnedAt), desc(products.createdAt));

    return result.map((r) => {
      const product = r.products;
      if (!product.thumbnailUrl) {
        product.thumbnailUrl = getPlatformLogoUrl(product.platform) || null;
      }
      return { ...product, seller: r.users };
    });
  }

  async updateProductAdmin(id: string, data: Partial<Product>): Promise<Product> {
    const [product] = await db
      .update(products)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    return product;
  }

  async updateProductPin(id: string, isPinned: boolean): Promise<Product> {
    const [product] = await db
      .update(products)
      .set({ 
        isPinned, 
        pinnedAt: isPinned ? new Date() : null,
        updatedAt: new Date() 
      })
      .where(eq(products.id, id))
      .returning();
    return product;
  }

  async getPendingProducts(): Promise<(Product & { seller: User })[]> {
    const result = await db
      .select()
      .from(products)
      .innerJoin(users, eq(products.sellerId, users.id))
      .where(eq(products.status, "pending_approval"))
      .orderBy(desc(products.createdAt));

    return result.map((r) => ({ ...r.products, seller: r.users }));
  }

  async getSellerProducts(sellerId: string): Promise<Product[]> {
    return await db
      .select()
      .from(products)
      .where(eq(products.sellerId, sellerId))
      .orderBy(desc(products.createdAt));
  }

  async deleteProduct(id: string): Promise<void> {
    // Also delete related product items
    await db.delete(productItems).where(eq(productItems.productId, id));
    await db.delete(products).where(eq(products.id, id));
  }

  async deleteProductWithRelations(productId: string): Promise<void> {
    // Delete in correct order to avoid foreign key constraints
    // 1. Get all orders for this product
    const productOrders = await db.select({ id: orders.id }).from(orders).where(eq(orders.productId, productId));
    
    for (const order of productOrders) {
      // 1a. Delete wallet transactions referencing this order
      await db.delete(walletTransactions).where(eq(walletTransactions.relatedOrderId, order.id));
      // 1b. Delete reviews related to this order
      await db.delete(reviews).where(eq(reviews.orderId, order.id));
    }
    // 2. Delete orders
    await db.delete(orders).where(eq(orders.productId, productId));
    // 3. Delete product items
    await db.delete(productItems).where(eq(productItems.productId, productId));
    // 4. Delete product
    await db.delete(products).where(eq(products.id, productId));
  }

  async cleanupExpiredReservations(): Promise<number> {
    // Release all expired reserved items back to available
    const result = await db
      .update(productItems)
      .set({ status: "available", reservedUntil: null })
      .where(
        and(
          eq(productItems.status, "reserved"),
          lt(productItems.reservedUntil, new Date())
        )
      )
      .returning();
    return result.length;
  }

  async cancelExpiredPendingOrders(): Promise<number> {
    // Cancel orders that have been pending_payment for more than 30 minutes
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    // Get expired pending orders
    const expiredOrders = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.status, "pending_payment"),
          lt(orders.createdAt, thirtyMinutesAgo)
        )
      );

    for (const order of expiredOrders) {
      // Release the reserved product item
      if (order.productItemId) {
        await db
          .update(productItems)
          .set({ status: "available", reservedUntil: null })
          .where(eq(productItems.id, order.productItemId));
      }
      
      // Update order status to cancelled
      await db
        .update(orders)
        .set({ status: "cancelled" })
        .where(eq(orders.id, order.id));
    }

    return expiredOrders.length;
  }

  async productHasOrders(productId: string): Promise<boolean> {
    const result = await db
      .select({ count: count() })
      .from(orders)
      .where(eq(orders.productId, productId));
    return (result[0]?.count || 0) > 0;
  }

  // Product Items
  async getProductItem(id: string): Promise<ProductItem | undefined> {
    const [item] = await db.select().from(productItems).where(eq(productItems.id, id));
    return item;
  }

  async getProductItems(productId: string): Promise<ProductItem[]> {
    return await db
      .select()
      .from(productItems)
      .where(eq(productItems.productId, productId));
  }

  async getAvailableProductItem(productId: string): Promise<ProductItem | undefined> {
    const [item] = await db
      .select()
      .from(productItems)
      .where(
        and(
          eq(productItems.productId, productId),
          eq(productItems.status, "available")
        )
      )
      .limit(1);
    return item;
  }

  async getAvailableProductItems(productId: string, count: number): Promise<ProductItem[]> {
    // First, reset any expired reservations
    await db
      .update(productItems)
      .set({ status: "available", reservedUntil: null })
      .where(
        and(
          eq(productItems.productId, productId),
          eq(productItems.status, "reserved"),
          lt(productItems.reservedUntil, new Date())
        )
      );
    
    // Then get available items
    return await db
      .select()
      .from(productItems)
      .where(
        and(
          eq(productItems.productId, productId),
          eq(productItems.status, "available")
        )
      )
      .limit(count);
  }

  async createProductItems(items: InsertProductItem[]): Promise<ProductItem[]> {
    if (items.length === 0) return [];
    return await db.insert(productItems).values(items).returning();
  }

  async updateProductItemStatus(id: string, status: "available" | "reserved" | "sold"): Promise<ProductItem> {
    const [item] = await db
      .update(productItems)
      .set({ status, reservedUntil: status === "sold" || status === "available" ? null : undefined })
      .where(eq(productItems.id, id))
      .returning();
    return item;
  }

  async reserveProductItem(id: string, reservedUntil: Date): Promise<ProductItem> {
    const [item] = await db
      .update(productItems)
      .set({ status: "reserved", reservedUntil })
      .where(eq(productItems.id, id))
      .returning();
    return item;
  }

  async checkDuplicateUid(uidHash: string): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(productItems)
      .where(eq(productItems.uidHash, uidHash))
      .limit(1);
    return !!existing;
  }

  async deleteProductItem(id: string): Promise<void> {
    await db.delete(productItems).where(eq(productItems.id, id));
  }

  async updateProductItemContent(id: string, content: string): Promise<ProductItem> {
    const [item] = await db
      .update(productItems)
      .set({ content, uidHash: hashUid(content) })
      .where(eq(productItems.id, id))
      .returning();
    return item;
  }

  // Orders
  async getOrder(id: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order;
  }

  async getOrderWithDetails(id: string): Promise<(Order & { product: Product; buyer: User; seller: User; productItem?: ProductItem }) | undefined> {
    const result = await db
      .select()
      .from(orders)
      .innerJoin(products, eq(orders.productId, products.id))
      .innerJoin(users, eq(orders.buyerId, users.id))
      .where(eq(orders.id, id));

    if (result.length === 0) return undefined;

    const order = result[0].orders;
    const product = result[0].products;
    const buyer = result[0].users;

    const [sellerResult] = await db
      .select()
      .from(users)
      .where(eq(users.id, order.sellerId));

    let productItem: ProductItem | undefined;
    if (order.productItemId) {
      const [item] = await db
        .select()
        .from(productItems)
        .where(eq(productItems.id, order.productItemId));
      productItem = item;
    }

    return { ...order, product, buyer, seller: sellerResult, productItem };
  }

  async getBuyerOrders(buyerId: string): Promise<(Order & { product: Product })[]> {
    const result = await db
      .select()
      .from(orders)
      .innerJoin(products, eq(orders.productId, products.id))
      .where(eq(orders.buyerId, buyerId))
      .orderBy(desc(orders.createdAt));

    return result.map((r) => ({ ...r.orders, product: r.products }));
  }

  async getSellerOrders(sellerId: string): Promise<(Order & { product: Product })[]> {
    const result = await db
      .select()
      .from(orders)
      .innerJoin(products, eq(orders.productId, products.id))
      .where(eq(orders.sellerId, sellerId))
      .orderBy(desc(orders.createdAt));

    return result.map((r) => ({ ...r.orders, product: r.products }));
  }

  async getPendingOrders(): Promise<(Order & { product: Product; buyer: User })[]> {
    const result = await db
      .select()
      .from(orders)
      .innerJoin(products, eq(orders.productId, products.id))
      .innerJoin(users, eq(orders.buyerId, users.id))
      .where(eq(orders.status, "pending_confirmation"))
      .orderBy(desc(orders.createdAt));

    return result.map((r) => ({ ...r.orders, product: r.products, buyer: r.users }));
  }

  async getAllOrders(): Promise<(Order & { product: Product; buyer: User; seller: User | null })[]> {
    const result = await db
      .select()
      .from(orders)
      .innerJoin(products, eq(orders.productId, products.id))
      .innerJoin(users, eq(orders.buyerId, users.id))
      .orderBy(desc(orders.createdAt));

    // Fetch seller info separately
    const ordersWithSeller = await Promise.all(
      result.map(async (r) => {
        let seller: User | null = null;
        if (r.orders.sellerId) {
          const [sellerData] = await db.select().from(users).where(eq(users.id, r.orders.sellerId));
          seller = sellerData || null;
        }
        return { ...r.orders, product: r.products, buyer: r.users, seller };
      })
    );
    return ordersWithSeller;
  }

  async createOrder(orderData: InsertOrder): Promise<Order> {
    const orderCode = `DH-${Date.now().toString().slice(-8)}${Math.random().toString(36).slice(-4).toUpperCase()}`;
    const [order] = await db.insert(orders).values({
      ...orderData,
      orderCode,
    }).returning();
    return order;
  }

  async updateOrderStatus(id: string, status: "pending_payment" | "pending_confirmation" | "paid" | "cancelled" | "refunded"): Promise<Order> {
    const [order] = await db
      .update(orders)
      .set({ status, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return order;
  }

  async updateOrderPaymentConfirmation(id: string, confirmedAt: Date): Promise<Order> {
    const [order] = await db
      .update(orders)
      .set({ paymentConfirmedAt: confirmedAt, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return order;
  }

  async updateOrderDeliveredContent(id: string, content: string): Promise<Order> {
    const [order] = await db
      .update(orders)
      .set({ deliveredContent: content, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return order;
  }

  async deleteOrder(id: string): Promise<void> {
    // Delete reviews first (foreign key dependency)
    await db.delete(reviews).where(eq(reviews.orderId, id));
    // Then delete order
    await db.delete(orders).where(eq(orders.id, id));
  }

  // Wallet Transactions
  async createWalletTransaction(transactionData: InsertWalletTransaction): Promise<WalletTransaction> {
    const [transaction] = await db.insert(walletTransactions).values(transactionData).returning();
    return transaction;
  }

  async getUserTransactions(userId: string): Promise<WalletTransaction[]> {
    return await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.userId, userId))
      .orderBy(desc(walletTransactions.createdAt));
  }

  // Withdrawals
  async getWithdrawal(id: string): Promise<Withdrawal | undefined> {
    const [withdrawal] = await db.select().from(withdrawals).where(eq(withdrawals.id, id));
    return withdrawal;
  }

  async getWithdrawalWithSeller(id: string): Promise<(Withdrawal & { seller: User }) | undefined> {
    const result = await db
      .select()
      .from(withdrawals)
      .innerJoin(users, eq(withdrawals.sellerId, users.id))
      .where(eq(withdrawals.id, id));

    if (result.length === 0) return undefined;
    return { ...result[0].withdrawals, seller: result[0].users };
  }

  async getPendingWithdrawals(): Promise<(Withdrawal & { seller: User })[]> {
    const result = await db
      .select()
      .from(withdrawals)
      .innerJoin(users, eq(withdrawals.sellerId, users.id))
      .where(or(eq(withdrawals.status, "pending"), eq(withdrawals.status, "approved")))
      .orderBy(desc(withdrawals.requestedAt));

    return result.map((r) => ({ ...r.withdrawals, seller: r.users }));
  }

  async getSellerWithdrawals(sellerId: string): Promise<Withdrawal[]> {
    return await db
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.sellerId, sellerId))
      .orderBy(desc(withdrawals.requestedAt));
  }

  async createWithdrawal(withdrawalData: InsertWithdrawal): Promise<Withdrawal> {
    const [withdrawal] = await db.insert(withdrawals).values(withdrawalData).returning();
    return withdrawal;
  }

  async updateWithdrawalStatus(id: string, status: "pending" | "approved" | "completed" | "rejected"): Promise<Withdrawal> {
    const updates: any = { status };
    if (status === "completed" || status === "rejected") {
      updates.processedAt = new Date();
    }
    const [withdrawal] = await db
      .update(withdrawals)
      .set(updates)
      .where(eq(withdrawals.id, id))
      .returning();
    return withdrawal;
  }

  // Files
  async createFile(fileData: InsertFile): Promise<FileRecord> {
    const [file] = await db.insert(files).values(fileData).returning();
    return file;
  }

  async getProductFiles(productId: string): Promise<FileRecord[]> {
    return await db.select().from(files).where(eq(files.productId, productId));
  }

  // Admin Logs
  async createAdminLog(logData: InsertAdminLog): Promise<AdminLog> {
    const [log] = await db.insert(adminLogs).values(logData).returning();
    return log;
  }

  // System Settings
  async getSystemSetting(key: string): Promise<string | undefined> {
    const [setting] = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, key));
    return setting?.value;
  }

  async getAllSystemSettings(): Promise<Record<string, string>> {
    const settings = await db.select().from(systemSettings);
    const result: Record<string, string> = {};
    settings.forEach(s => {
      result[s.key] = s.value;
    });
    return result;
  }

  async updateSystemSetting(key: string, value: string, description?: string): Promise<void> {
    const existing = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(systemSettings)
        .set({ value, description, updatedAt: new Date() })
        .where(eq(systemSettings.key, key));
    } else {
      await db.insert(systemSettings).values({ key, value, description });
    }
  }

  // Stats
  async getAdminStats() {
    const [usersCount] = await db.select({ count: count() }).from(users);
    const [sellersCount] = await db.select({ count: count() }).from(sellers);
    const [productsCount] = await db.select({ count: count() }).from(products).where(eq(products.status, "active"));
    const [ordersCount] = await db.select({ count: count() }).from(orders);
    
    // Calculate revenue for current month only (auto-reset every month)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const [revenueResult] = await db
      .select({ total: sum(orders.price) })
      .from(orders)
      .where(and(
        eq(orders.status, "paid"),
        gte(orders.createdAt, startOfMonth)
      ));
    
    const [pendingKycCount] = await db.select({ count: count() }).from(sellers).where(eq(sellers.kycStatus, "pending"));
    const [pendingProductsCount] = await db.select({ count: count() }).from(products).where(eq(products.status, "pending_approval"));
    const [pendingOrdersCount] = await db.select({ count: count() }).from(orders).where(eq(orders.status, "pending_confirmation"));
    const [pendingWithdrawalsCount] = await db.select({ count: count() }).from(withdrawals).where(or(eq(withdrawals.status, "pending"), eq(withdrawals.status, "approved")));
    const [pendingDepositsCount] = await db.select({ count: count() }).from(deposits).where(eq(deposits.status, "pending"));

    return {
      totalUsers: usersCount?.count || 0,
      totalSellers: sellersCount?.count || 0,
      totalProducts: productsCount?.count || 0,
      totalOrders: ordersCount?.count || 0,
      totalRevenue: parseFloat(revenueResult?.total || "0"),
      pendingKyc: pendingKycCount?.count || 0,
      pendingProducts: pendingProductsCount?.count || 0,
      pendingOrders: pendingOrdersCount?.count || 0,
      pendingWithdrawals: pendingWithdrawalsCount?.count || 0,
      pendingDeposits: pendingDepositsCount?.count || 0,
    };
  }

  // Revenue Reports - with optional year/month filtering
  async getRevenueReport(period: string, year?: number, month?: number): Promise<{ date: string; revenue: number; orders: number }[]> {
    // Build date range filter
    let startDate: Date | undefined;
    let endDate: Date | undefined;
    
    if (year) {
      if (month) {
        // Filter by specific month
        startDate = new Date(year, month - 1, 1);
        endDate = new Date(year, month, 1);
      } else {
        // Filter by entire year
        startDate = new Date(year, 0, 1);
        endDate = new Date(year + 1, 0, 1);
      }
    }
    
    let query = db
      .select({
        price: orders.price,
        createdAt: orders.createdAt,
      })
      .from(orders);
    
    // Apply filters
    if (startDate && endDate) {
      query = query.where(and(
        eq(orders.status, "paid"),
        gte(orders.createdAt, startDate),
        lt(orders.createdAt, endDate)
      )) as any;
    } else {
      query = query.where(eq(orders.status, "paid")) as any;
    }
    
    const paidOrders = await query.orderBy(desc(orders.createdAt));

    const groupedData: Record<string, { revenue: number; orders: number }> = {};
    
    for (const order of paidOrders) {
      if (!order.createdAt) continue;
      const date = new Date(order.createdAt);
      let key: string;
      
      if (period === "daily") {
        key = date.toISOString().split("T")[0];
      } else if (period === "weekly") {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split("T")[0];
      } else {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      }
      
      if (!groupedData[key]) {
        groupedData[key] = { revenue: 0, orders: 0 };
      }
      groupedData[key].revenue += parseFloat(order.price);
      groupedData[key].orders += 1;
    }
    
    return Object.entries(groupedData)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30);
  }

  async getSellerRevenueReport(year?: number, month?: number): Promise<{ sellerId: string; shopName: string; revenue: number; orders: number }[]> {
    // Build date range filter
    let startDate: Date | undefined;
    let endDate: Date | undefined;
    
    if (year) {
      if (month) {
        // Filter by specific month
        startDate = new Date(year, month - 1, 1);
        endDate = new Date(year, month, 1);
      } else {
        // Filter by entire year
        startDate = new Date(year, 0, 1);
        endDate = new Date(year + 1, 0, 1);
      }
    }
    
    let query = db
      .select({
        sellerId: orders.sellerId,
        price: orders.price,
      })
      .from(orders);
    
    // Apply filters
    if (startDate && endDate) {
      query = query.where(and(
        eq(orders.status, "paid"),
        gte(orders.createdAt, startDate),
        lt(orders.createdAt, endDate)
      )) as any;
    } else {
      query = query.where(eq(orders.status, "paid")) as any;
    }
    
    const result = await query;

    const sellerData: Record<string, { revenue: number; orders: number }> = {};
    
    for (const order of result) {
      if (!sellerData[order.sellerId]) {
        sellerData[order.sellerId] = { revenue: 0, orders: 0 };
      }
      sellerData[order.sellerId].revenue += parseFloat(order.price);
      sellerData[order.sellerId].orders += 1;
    }

    const sellerIds = Object.keys(sellerData);
    if (sellerIds.length === 0) {
      return [];
    }

    const allSellers = await db.select().from(sellers);
    const shopNames: Record<string, string> = {};
    for (const seller of allSellers) {
      shopNames[seller.id] = seller.shopName || "Unknown";
    }

    return Object.entries(sellerData)
      .map(([sellerId, data]) => ({
        sellerId,
        shopName: shopNames[sellerId] || "Unknown",
        ...data,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  // Sellers Management
  async getAllSellers(): Promise<(Seller & { user: User })[]> {
    const result = await db
      .select()
      .from(sellers)
      .innerJoin(users, eq(sellers.id, users.id))
      .orderBy(desc(sellers.createdAt));

    return result.map((r) => ({ ...r.sellers, user: r.users }));
  }

  async updateSellerLockStatus(id: string, isLocked: boolean): Promise<Seller> {
    const [seller] = await db
      .update(sellers)
      .set({ isShopLocked: isLocked })
      .where(eq(sellers.id, id))
      .returning();
    return seller;
  }

  // User Management
  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async updateUserStatus(id: string, status: "active" | "banned" | "pending"): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ status, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    // Delete related records first to avoid foreign key constraints
    await db.delete(walletTransactions).where(eq(walletTransactions.userId, id));
    await db.delete(notifications).where(eq(notifications.userId, id));
    await db.delete(notificationSettings).where(eq(notificationSettings.userId, id));
    await db.delete(wishlists).where(eq(wishlists.userId, id));
    await db.delete(deposits).where(eq(deposits.userId, id));
    await db.delete(withdrawals).where(eq(withdrawals.sellerId, id));
    
    // Delete messages where user is sender
    await db.delete(messages).where(eq(messages.senderId, id));
    
    // Delete conversations where user is participant
    await db.delete(conversations).where(or(
      eq(conversations.participant1Id, id),
      eq(conversations.participant2Id, id)
    ));
    
    // Set buyerId to null for orders (keep order history)
    await db.update(orders).set({ buyerId: null as any }).where(eq(orders.buyerId, id));
    
    // Delete reviews
    await db.delete(reviews).where(eq(reviews.buyerId, id));
    
    // Delete pending earnings
    await db.delete(pendingEarnings).where(eq(pendingEarnings.sellerId, id));
    
    // Delete seller if exists (sellers.id references users.id)
    await db.delete(sellers).where(eq(sellers.id, id));
    
    // Finally delete user
    await db.delete(users).where(eq(users.id, id));
  }

  // Deposits
  async createDeposit(deposit: InsertDeposit): Promise<Deposit> {
    const [result] = await db.insert(deposits).values(deposit).returning();
    return result;
  }

  async getDeposit(id: string): Promise<Deposit | undefined> {
    const [deposit] = await db.select().from(deposits).where(eq(deposits.id, id));
    return deposit;
  }

  async getDepositWithUser(id: string): Promise<(Deposit & { user: User }) | undefined> {
    const [result] = await db
      .select()
      .from(deposits)
      .innerJoin(users, eq(deposits.userId, users.id))
      .where(eq(deposits.id, id));
    
    if (!result) return undefined;
    return { ...result.deposits, user: result.users };
  }

  async getUserDeposits(userId: string): Promise<Deposit[]> {
    return db
      .select()
      .from(deposits)
      .where(eq(deposits.userId, userId))
      .orderBy(desc(deposits.requestedAt));
  }

  async getPendingDeposits(): Promise<(Deposit & { user: User })[]> {
    const result = await db
      .select()
      .from(deposits)
      .innerJoin(users, eq(deposits.userId, users.id))
      .where(eq(deposits.status, "pending"))
      .orderBy(desc(deposits.requestedAt));
    
    return result.map((r) => ({ ...r.deposits, user: r.users }));
  }

  async updateDepositStatus(id: string, status: "pending" | "approved" | "rejected", adminNote?: string): Promise<Deposit> {
    const [deposit] = await db
      .update(deposits)
      .set({ 
        status, 
        adminNote: adminNote || null,
        processedAt: new Date() 
      })
      .where(eq(deposits.id, id))
      .returning();
    return deposit;
  }

  // Conversations & Messages
  async createConversation(conversation: InsertConversation): Promise<Conversation> {
    const [result] = await db.insert(conversations).values(conversation).returning();
    return result;
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conv;
  }

  async getUserConversations(userId: string): Promise<(Conversation & { participant1: User; participant2: User; lastMessage?: Message })[]> {
    const result = await db
      .select()
      .from(conversations)
      .innerJoin(users, eq(conversations.participant1Id, users.id))
      .where(
        or(
          eq(conversations.participant1Id, userId),
          eq(conversations.participant2Id, userId)
        )
      )
      .orderBy(desc(conversations.lastMessageAt));

    const conversationsWithDetails: (Conversation & { participant1: User; participant2: User; lastMessage?: Message })[] = [];

    for (const r of result) {
      const [participant1] = await db.select().from(users).where(eq(users.id, r.conversations.participant1Id));
      const [participant2] = await db.select().from(users).where(eq(users.id, r.conversations.participant2Id));
      
      const [lastMessage] = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, r.conversations.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      conversationsWithDetails.push({
        ...r.conversations,
        participant1,
        participant2,
        lastMessage: lastMessage || undefined,
      });
    }

    return conversationsWithDetails;
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const [result] = await db.insert(messages).values(message).returning();
    
    await db
      .update(conversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(conversations.id, message.conversationId));
    
    return result;
  }

  async getConversationMessages(conversationId: string): Promise<(Message & { sender: User })[]> {
    const result = await db
      .select()
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);

    return result.map((r) => ({ ...r.messages, sender: r.users }));
  }

  async markMessagesAsRead(conversationId: string, userId: string): Promise<void> {
    await db
      .update(messages)
      .set({ isRead: true })
      .where(
        and(
          eq(messages.conversationId, conversationId),
          ne(messages.senderId, userId),
          eq(messages.isRead, false)
        )
      );
  }

  async getUnreadMessageCount(userId: string): Promise<number> {
    const userConversations = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        or(
          eq(conversations.participant1Id, userId),
          eq(conversations.participant2Id, userId)
        )
      );

    if (userConversations.length === 0) return 0;

    const conversationIds = userConversations.map((c) => c.id);
    
    let totalUnread = 0;
    for (const convId of conversationIds) {
      const [result] = await db
        .select({ count: count() })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, convId),
            ne(messages.senderId, userId),
            eq(messages.isRead, false)
          )
        );
      totalUnread += result?.count || 0;
    }
    
    return totalUnread;
  }

  async getOrCreateAdminConversation(userId: string, adminId: string): Promise<Conversation> {
    const [existing] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.type, "support"),
          or(
            and(eq(conversations.participant1Id, userId), eq(conversations.participant2Id, adminId)),
            and(eq(conversations.participant1Id, adminId), eq(conversations.participant2Id, userId))
          )
        )
      );

    if (existing) return existing;

    const [newConv] = await db
      .insert(conversations)
      .values({
        type: "support",
        participant1Id: userId,
        participant2Id: adminId,
        subject: "Hỗ trợ từ Admin",
      })
      .returning();

    return newConv;
  }

  // Reviews
  async createReview(review: InsertReview): Promise<Review> {
    const [result] = await db.insert(reviews).values(review).returning();
    return result;
  }

  async getReview(id: string): Promise<Review | undefined> {
    const [review] = await db.select().from(reviews).where(eq(reviews.id, id));
    return review;
  }

  async getSellerReviews(sellerId: string): Promise<(Review & { buyer: User; order: Order })[]> {
    const result = await db
      .select()
      .from(reviews)
      .innerJoin(users, eq(reviews.buyerId, users.id))
      .innerJoin(orders, eq(reviews.orderId, orders.id))
      .where(and(eq(reviews.sellerId, sellerId), eq(reviews.isVisible, true)))
      .orderBy(desc(reviews.createdAt));

    return result.map((r) => ({ ...r.reviews, buyer: r.users, order: r.orders }));
  }

  async getAllReviews(): Promise<(Review & { buyer: User; seller: User; order: Order })[]> {
    const result = await db
      .select()
      .from(reviews)
      .innerJoin(orders, eq(reviews.orderId, orders.id))
      .orderBy(desc(reviews.createdAt));

    const reviewsWithDetails: (Review & { buyer: User; seller: User; order: Order })[] = [];
    
    for (const r of result) {
      const [buyer] = await db.select().from(users).where(eq(users.id, r.reviews.buyerId));
      const [seller] = await db.select().from(users).where(eq(users.id, r.reviews.sellerId));
      
      if (buyer && seller) {
        reviewsWithDetails.push({
          ...r.reviews,
          buyer,
          seller,
          order: r.orders,
        });
      }
    }

    return reviewsWithDetails;
  }

  async updateReviewVisibility(id: string, isVisible: boolean): Promise<Review> {
    const [review] = await db
      .update(reviews)
      .set({ isVisible })
      .where(eq(reviews.id, id))
      .returning();
    return review;
  }

  async getOrderReview(orderId: string): Promise<Review | undefined> {
    const [review] = await db.select().from(reviews).where(eq(reviews.orderId, orderId));
    return review;
  }

  // Notification Settings
  async getNotificationSettings(userId: string): Promise<NotificationSettings | undefined> {
    const [settings] = await db
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.userId, userId));
    return settings;
  }

  async createNotificationSettings(settings: InsertNotificationSettings): Promise<NotificationSettings> {
    const [result] = await db.insert(notificationSettings).values(settings).returning();
    return result;
  }

  async updateNotificationSettings(userId: string, settings: Partial<NotificationSettings>): Promise<NotificationSettings> {
    const [result] = await db
      .update(notificationSettings)
      .set({ ...settings, updatedAt: new Date() })
      .where(eq(notificationSettings.userId, userId))
      .returning();
    return result;
  }

  async getOrCreateNotificationSettings(userId: string): Promise<NotificationSettings> {
    const existing = await this.getNotificationSettings(userId);
    if (existing) return existing;
    return this.createNotificationSettings({ userId });
  }

  // Notifications
  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [result] = await db.insert(notifications).values(notification).returning();
    return result;
  }

  async getUserNotifications(userId: string): Promise<Notification[]> {
    return db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  }

  async getUnreadNotificationsCount(userId: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return result?.count ?? 0;
  }

  async markNotificationAsRead(id: string): Promise<Notification> {
    const [result] = await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id))
      .returning();
    return result;
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));
  }

  async deleteNotification(id: string): Promise<void> {
    await db.delete(notifications).where(eq(notifications.id, id));
  }

  async clearAllNotifications(userId: string): Promise<void> {
    await db.delete(notifications).where(eq(notifications.userId, userId));
  }

  // Referrals
  async getUserReferralCode(userId: string): Promise<UserReferralCode | undefined> {
    const [code] = await db.select().from(userReferralCodes).where(eq(userReferralCodes.userId, userId));
    return code;
  }

  async createUserReferralCode(data: InsertUserReferralCode): Promise<UserReferralCode> {
    const [code] = await db.insert(userReferralCodes).values(data).returning();
    return code;
  }

  async getReferralByCode(code: string): Promise<UserReferralCode | undefined> {
    const [result] = await db.select().from(userReferralCodes).where(eq(userReferralCodes.code, code));
    return result;
  }

  async createReferral(data: InsertReferral): Promise<Referral> {
    const [referral] = await db.insert(referrals).values(data).returning();
    return referral;
  }

  async getUserReferrals(userId: string): Promise<(Referral & { referred: User })[]> {
    const results = await db
      .select()
      .from(referrals)
      .innerJoin(users, eq(referrals.referredId, users.id))
      .where(eq(referrals.referrerId, userId))
      .orderBy(desc(referrals.createdAt));
    return results.map(r => ({ ...r.referrals, referred: r.users }));
  }

  async getReferralByReferredId(referredId: string): Promise<Referral | undefined> {
    const [result] = await db.select().from(referrals).where(eq(referrals.referredId, referredId));
    return result;
  }

  async updateReferralEarnings(referralId: string, amount: string): Promise<void> {
    await db
      .update(referrals)
      .set({ totalEarned: sql`${referrals.totalEarned} + ${amount}` })
      .where(eq(referrals.id, referralId));
  }

  async updateUserReferralCodeStats(userId: string, earnings: string): Promise<void> {
    await db
      .update(userReferralCodes)
      .set({
        totalReferrals: sql`${userReferralCodes.totalReferrals} + 1`,
        totalEarnings: sql`${userReferralCodes.totalEarnings} + ${earnings}`,
      })
      .where(eq(userReferralCodes.userId, userId));
  }

  async updateReferrerTotalEarnings(userId: string, earnings: string): Promise<void> {
    await db
      .update(userReferralCodes)
      .set({
        totalEarnings: sql`${userReferralCodes.totalEarnings} + ${earnings}`,
      })
      .where(eq(userReferralCodes.userId, userId));
  }

  async incrementReferralCount(userId: string): Promise<void> {
    await db
      .update(userReferralCodes)
      .set({
        totalReferrals: sql`${userReferralCodes.totalReferrals} + 1`,
      })
      .where(eq(userReferralCodes.userId, userId));
  }

  async creditUserWallet(userId: string, amount: string): Promise<void> {
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) return;
    
    await db
      .update(users)
      .set({
        walletBalance: sql`COALESCE(${users.walletBalance}, 0) + ${numericAmount}::numeric`,
      })
      .where(eq(users.id, userId));
  }

  // Flash Sales
  async createFlashSale(data: InsertFlashSale): Promise<FlashSale> {
    const [sale] = await db.insert(flashSales).values(data).returning();
    return sale;
  }

  async getFlashSale(id: string): Promise<FlashSale | undefined> {
    const [sale] = await db.select().from(flashSales).where(eq(flashSales.id, id));
    return sale;
  }

  async getActiveFlashSales(): Promise<FlashSale[]> {
    const now = new Date();
    return db
      .select()
      .from(flashSales)
      .where(
        and(
          eq(flashSales.isActive, true),
          lte(flashSales.startTime, now),
          gte(flashSales.endTime, now)
        )
      )
      .orderBy(asc(flashSales.endTime));
  }

  async getAllFlashSales(): Promise<FlashSale[]> {
    return db.select().from(flashSales).orderBy(desc(flashSales.createdAt));
  }

  async updateFlashSale(id: string, data: Partial<FlashSale>): Promise<FlashSale> {
    const [sale] = await db.update(flashSales).set(data).where(eq(flashSales.id, id)).returning();
    return sale;
  }

  async deleteFlashSale(id: string): Promise<void> {
    await db.delete(flashSales).where(eq(flashSales.id, id));
  }

  async addFlashSaleProduct(data: InsertFlashSaleProduct): Promise<FlashSaleProduct> {
    const [product] = await db.insert(flashSaleProducts).values(data).returning();
    return product;
  }

  async getFlashSaleProducts(flashSaleId: string): Promise<(FlashSaleProduct & { product: Product })[]> {
    const results = await db
      .select()
      .from(flashSaleProducts)
      .innerJoin(products, eq(flashSaleProducts.productId, products.id))
      .where(eq(flashSaleProducts.flashSaleId, flashSaleId));
    return results.map(r => ({ ...r.flash_sale_products, product: r.products }));
  }

  async removeFlashSaleProduct(id: string): Promise<void> {
    await db.delete(flashSaleProducts).where(eq(flashSaleProducts.id, id));
  }

  async getProductFlashSale(productId: string): Promise<(FlashSaleProduct & { flashSale: FlashSale }) | undefined> {
    const now = new Date();
    const results = await db
      .select()
      .from(flashSaleProducts)
      .innerJoin(flashSales, eq(flashSaleProducts.flashSaleId, flashSales.id))
      .where(
        and(
          eq(flashSaleProducts.productId, productId),
          eq(flashSales.isActive, true),
          lte(flashSales.startTime, now),
          gte(flashSales.endTime, now)
        )
      );
    if (results.length === 0) return undefined;
    return { ...results[0].flash_sale_products, flashSale: results[0].flash_sales };
  }

  // Wishlists
  async addToWishlist(data: InsertWishlist): Promise<Wishlist> {
    const [wishlist] = await db.insert(wishlists).values(data).returning();
    return wishlist;
  }

  async removeFromWishlist(userId: string, productId: string): Promise<void> {
    await db.delete(wishlists).where(and(eq(wishlists.userId, userId), eq(wishlists.productId, productId)));
  }

  async getUserWishlist(userId: string): Promise<(Wishlist & { product: Product })[]> {
    const results = await db
      .select()
      .from(wishlists)
      .innerJoin(products, eq(wishlists.productId, products.id))
      .where(eq(wishlists.userId, userId))
      .orderBy(desc(wishlists.createdAt));
    return results.map(r => ({
      ...r.wishlists,
      product: {
        ...r.products,
        thumbnailUrl: r.products.thumbnailUrl || getPlatformLogoUrl(r.products.platform),
      },
    }));
  }

  async isInWishlist(userId: string, productId: string): Promise<boolean> {
    const [result] = await db
      .select()
      .from(wishlists)
      .where(and(eq(wishlists.userId, userId), eq(wishlists.productId, productId)));
    return !!result;
  }

  async getWishlistUsersForProduct(productId: string): Promise<Wishlist[]> {
    return db.select().from(wishlists).where(and(eq(wishlists.productId, productId), eq(wishlists.notifyOnPriceDrop, true)));
  }

  // Bundles
  async createBundle(data: InsertBundle): Promise<Bundle> {
    const [bundle] = await db.insert(bundles).values(data).returning();
    return bundle;
  }

  async getBundle(id: string): Promise<Bundle | undefined> {
    const [bundle] = await db.select().from(bundles).where(eq(bundles.id, id));
    return bundle;
  }

  async getBundleWithItems(id: string): Promise<(Bundle & { items: (BundleItem & { product: Product })[] }) | undefined> {
    const [bundle] = await db.select().from(bundles).where(eq(bundles.id, id));
    if (!bundle) return undefined;

    const items = await db
      .select()
      .from(bundleItems)
      .innerJoin(products, eq(bundleItems.productId, products.id))
      .where(eq(bundleItems.bundleId, id));

    return {
      ...bundle,
      items: items.map(i => ({
        ...i.bundle_items,
        product: {
          ...i.products,
          thumbnailUrl: i.products.thumbnailUrl || getPlatformLogoUrl(i.products.platform),
        },
      })),
    };
  }

  async getSellerBundles(sellerId: string): Promise<Bundle[]> {
    return db.select().from(bundles).where(eq(bundles.sellerId, sellerId)).orderBy(desc(bundles.createdAt));
  }

  async getAllBundles(): Promise<(Bundle & { seller: User })[]> {
    const results = await db
      .select()
      .from(bundles)
      .innerJoin(users, eq(bundles.sellerId, users.id))
      .where(eq(bundles.isActive, true))
      .orderBy(desc(bundles.createdAt));
    return results.map(r => ({ ...r.bundles, seller: r.users }));
  }

  async updateBundle(id: string, data: Partial<Bundle>): Promise<Bundle> {
    const [bundle] = await db.update(bundles).set({ ...data, updatedAt: new Date() }).where(eq(bundles.id, id)).returning();
    return bundle;
  }

  async deleteBundle(id: string): Promise<void> {
    await db.delete(bundles).where(eq(bundles.id, id));
  }

  async addBundleItem(data: InsertBundleItem): Promise<BundleItem> {
    const [item] = await db.insert(bundleItems).values(data).returning();
    return item;
  }

  async removeBundleItem(id: string): Promise<void> {
    await db.delete(bundleItems).where(eq(bundleItems.id, id));
  }

  // Telegram Settings
  async getTelegramSettings(userId: string): Promise<TelegramSettings | undefined> {
    const [settings] = await db.select().from(telegramSettings).where(eq(telegramSettings.userId, userId));
    return settings;
  }

  async createTelegramSettings(data: InsertTelegramSettings): Promise<TelegramSettings> {
    const [settings] = await db.insert(telegramSettings).values(data).returning();
    return settings;
  }

  async updateTelegramSettings(userId: string, data: Partial<TelegramSettings>): Promise<TelegramSettings> {
    const [settings] = await db
      .update(telegramSettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(telegramSettings.userId, userId))
      .returning();
    return settings;
  }

  async getTelegramSettingsByChatId(chatId: string): Promise<TelegramSettings | undefined> {
    const [settings] = await db.select().from(telegramSettings).where(eq(telegramSettings.chatId, chatId));
    return settings;
  }

  async getVerifiedTelegramUsers(): Promise<TelegramSettings[]> {
    return db.select().from(telegramSettings).where(eq(telegramSettings.isVerified, true));
  }

  // Warranties
  async createWarranty(data: InsertWarranty): Promise<Warranty> {
    const [warranty] = await db.insert(warranties).values(data).returning();
    return warranty;
  }

  async getWarranty(id: string): Promise<Warranty | undefined> {
    const [warranty] = await db.select().from(warranties).where(eq(warranties.id, id));
    return warranty;
  }

  async getOrderWarranty(orderId: string): Promise<Warranty | undefined> {
    const [warranty] = await db.select().from(warranties).where(eq(warranties.orderId, orderId));
    return warranty;
  }

  async getUserWarranties(userId: string): Promise<(Warranty & { product: Product; order: Order })[]> {
    const results = await db
      .select()
      .from(warranties)
      .innerJoin(products, eq(warranties.productId, products.id))
      .innerJoin(orders, eq(warranties.orderId, orders.id))
      .where(eq(warranties.buyerId, userId))
      .orderBy(desc(warranties.createdAt));
    return results.map(r => ({
      ...r.warranties,
      product: { ...r.products, thumbnailUrl: r.products.thumbnailUrl || getPlatformLogoUrl(r.products.platform) },
      order: r.orders,
    }));
  }

  async getSellerWarranties(sellerId: string): Promise<(Warranty & { product: Product; buyer: User })[]> {
    const results = await db
      .select()
      .from(warranties)
      .innerJoin(products, eq(warranties.productId, products.id))
      .innerJoin(users, eq(warranties.buyerId, users.id))
      .where(eq(warranties.sellerId, sellerId))
      .orderBy(desc(warranties.createdAt));
    return results.map(r => ({
      ...r.warranties,
      product: { ...r.products, thumbnailUrl: r.products.thumbnailUrl || getPlatformLogoUrl(r.products.platform) },
      buyer: r.users,
    }));
  }

  async updateWarrantyStatus(id: string, status: "active" | "claimed" | "expired" | "void"): Promise<Warranty> {
    const [warranty] = await db.update(warranties).set({ status }).where(eq(warranties.id, id)).returning();
    return warranty;
  }

  // Warranty Claims
  async createWarrantyClaim(data: InsertWarrantyClaim): Promise<WarrantyClaim> {
    const [claim] = await db.insert(warrantyClaims).values(data).returning();
    return claim;
  }

  async getWarrantyClaim(id: string): Promise<WarrantyClaim | undefined> {
    const [claim] = await db.select().from(warrantyClaims).where(eq(warrantyClaims.id, id));
    return claim;
  }

  async getWarrantyClaimWithDetails(id: string): Promise<(WarrantyClaim & { warranty: Warranty; buyer: User }) | undefined> {
    const results = await db
      .select()
      .from(warrantyClaims)
      .innerJoin(warranties, eq(warrantyClaims.warrantyId, warranties.id))
      .innerJoin(users, eq(warrantyClaims.buyerId, users.id))
      .where(eq(warrantyClaims.id, id));
    if (results.length === 0) return undefined;
    return { ...results[0].warranty_claims, warranty: results[0].warranties, buyer: results[0].users };
  }

  async getPendingWarrantyClaims(): Promise<(WarrantyClaim & { warranty: Warranty; buyer: User })[]> {
    const results = await db
      .select()
      .from(warrantyClaims)
      .innerJoin(warranties, eq(warrantyClaims.warrantyId, warranties.id))
      .innerJoin(users, eq(warrantyClaims.buyerId, users.id))
      .where(eq(warrantyClaims.status, "pending"))
      .orderBy(asc(warrantyClaims.createdAt));
    return results.map(r => ({ ...r.warranty_claims, warranty: r.warranties, buyer: r.users }));
  }

  async updateWarrantyClaimStatus(id: string, status: "pending" | "approved" | "rejected" | "processing", resolution?: string): Promise<WarrantyClaim> {
    const [claim] = await db
      .update(warrantyClaims)
      .set({ status, resolution, resolvedAt: status !== "pending" && status !== "processing" ? new Date() : null })
      .where(eq(warrantyClaims.id, id))
      .returning();
    return claim;
  }

  // Disputes
  async createDispute(data: InsertDispute): Promise<Dispute> {
    const [dispute] = await db.insert(disputes).values(data).returning();
    return dispute;
  }

  async getDispute(id: string): Promise<Dispute | undefined> {
    const [dispute] = await db.select().from(disputes).where(eq(disputes.id, id));
    return dispute;
  }

  async getDisputeWithDetails(id: string): Promise<(Dispute & { order: Order; buyer: User; seller: User }) | undefined> {
    const buyerAlias = users;
    const sellerAlias = users;
    const results = await db
      .select()
      .from(disputes)
      .innerJoin(orders, eq(disputes.orderId, orders.id))
      .where(eq(disputes.id, id));
    if (results.length === 0) return undefined;
    
    const buyer = await this.getUser(results[0].disputes.buyerId);
    const seller = await this.getUser(results[0].disputes.sellerId);
    if (!buyer || !seller) return undefined;
    
    return { ...results[0].disputes, order: results[0].orders, buyer, seller };
  }

  async getOrderDispute(orderId: string): Promise<Dispute | undefined> {
    const [dispute] = await db.select().from(disputes).where(eq(disputes.orderId, orderId));
    return dispute;
  }

  async getAllDisputes(): Promise<(Dispute & { order: Order; buyer: User; seller: User })[]> {
    const results = await db
      .select()
      .from(disputes)
      .innerJoin(orders, eq(disputes.orderId, orders.id))
      .orderBy(desc(disputes.createdAt));
    
    const disputesWithDetails = await Promise.all(
      results.map(async (r) => {
        const buyer = await this.getUser(r.disputes.buyerId);
        const seller = await this.getUser(r.disputes.sellerId);
        return { ...r.disputes, order: r.orders, buyer: buyer!, seller: seller! };
      })
    );
    return disputesWithDetails.filter(d => d.buyer && d.seller);
  }

  async updateDispute(id: string, data: Partial<Dispute>): Promise<Dispute> {
    const [dispute] = await db.update(disputes).set({ ...data, updatedAt: new Date() }).where(eq(disputes.id, id)).returning();
    return dispute;
  }

  async updateDisputeStatus(id: string, status: "open" | "investigating" | "resolved_buyer" | "resolved_seller" | "closed", resolution?: string): Promise<Dispute> {
    const isResolved = status.startsWith("resolved") || status === "closed";
    const [dispute] = await db
      .update(disputes)
      .set({ status, resolution, resolvedAt: isResolved ? new Date() : null, updatedAt: new Date() })
      .where(eq(disputes.id, id))
      .returning();
    return dispute;
  }

  // Pricing Suggestions
  async createPricingSuggestion(data: InsertPricingSuggestion): Promise<PricingSuggestion> {
    const [suggestion] = await db.insert(pricingSuggestions).values(data).returning();
    return suggestion;
  }

  async getProductPricingSuggestion(productId: string): Promise<PricingSuggestion | undefined> {
    const [suggestion] = await db
      .select()
      .from(pricingSuggestions)
      .where(eq(pricingSuggestions.productId, productId))
      .orderBy(desc(pricingSuggestions.createdAt))
      .limit(1);
    return suggestion;
  }

  async getPricingSuggestionsForPlatform(platform: string): Promise<{ minPrice: string; maxPrice: string; avgPrice: string; count: number }> {
    const activeProducts = await db
      .select({ price: products.price })
      .from(products)
      .where(and(eq(products.platform, platform), eq(products.status, "active")));

    if (activeProducts.length === 0) {
      return { minPrice: "0", maxPrice: "0", avgPrice: "0", count: 0 };
    }

    const prices = activeProducts.map(p => parseFloat(p.price));
    const minPrice = Math.min(...prices).toFixed(2);
    const maxPrice = Math.max(...prices).toFixed(2);
    const avgPrice = (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2);

    return { minPrice, maxPrice, avgPrice, count: activeProducts.length };
  }

  // Seller Analytics
  async getSellerAnalytics(sellerId: string): Promise<{
    totalSales: number;
    totalRevenue: string;
    totalOrders: number;
    averageOrderValue: string;
    topProducts: { productId: string; title: string; sales: number; revenue: string }[];
    monthlySales: { month: string; sales: number; revenue: string }[];
  }> {
    const sellerOrders = await db
      .select()
      .from(orders)
      .innerJoin(products, eq(orders.productId, products.id))
      .where(and(eq(orders.sellerId, sellerId), eq(orders.status, "paid")));

    const totalOrders = sellerOrders.length;
    const totalRevenue = sellerOrders.reduce((sum, o) => sum + parseFloat(o.orders.price), 0);
    const totalSales = sellerOrders.reduce((sum, o) => sum + o.orders.quantity, 0);
    const averageOrderValue = totalOrders > 0 ? (totalRevenue / totalOrders).toFixed(2) : "0.00";

    const productSales: Record<string, { title: string; sales: number; revenue: number }> = {};
    sellerOrders.forEach(o => {
      if (!productSales[o.orders.productId]) {
        productSales[o.orders.productId] = { title: o.products.title, sales: 0, revenue: 0 };
      }
      productSales[o.orders.productId].sales += o.orders.quantity;
      productSales[o.orders.productId].revenue += parseFloat(o.orders.price);
    });

    const topProducts = Object.entries(productSales)
      .map(([productId, data]) => ({ productId, title: data.title, sales: data.sales, revenue: data.revenue.toFixed(2) }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5);

    const monthlySalesMap: Record<string, { sales: number; revenue: number }> = {};
    sellerOrders.forEach(o => {
      const month = o.orders.createdAt ? new Date(o.orders.createdAt).toISOString().slice(0, 7) : "unknown";
      if (!monthlySalesMap[month]) {
        monthlySalesMap[month] = { sales: 0, revenue: 0 };
      }
      monthlySalesMap[month].sales += o.orders.quantity;
      monthlySalesMap[month].revenue += parseFloat(o.orders.price);
    });

    const monthlySales = Object.entries(monthlySalesMap)
      .map(([month, data]) => ({ month, sales: data.sales, revenue: data.revenue.toFixed(2) }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);

    return {
      totalSales,
      totalRevenue: totalRevenue.toFixed(2),
      totalOrders,
      averageOrderValue,
      topProducts,
      monthlySales,
    };
  }

  // User Activity
  async updateUserLastSeen(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ lastSeenAt: new Date() })
      .where(eq(users.id, userId));
  }

  async getActiveUsers(): Promise<User[]> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return await db
      .select()
      .from(users)
      .where(gte(users.lastSeenAt, fiveMinutesAgo));
  }

  // Admin Broadcasts
  async createAdminBroadcast(data: InsertAdminBroadcast): Promise<AdminBroadcast> {
    const [broadcast] = await db.insert(adminBroadcasts).values(data).returning();
    return broadcast;
  }

  async getActiveAdminBroadcasts(): Promise<AdminBroadcast[]> {
    const now = new Date();
    return await db
      .select()
      .from(adminBroadcasts)
      .where(
        and(
          eq(adminBroadcasts.isActive, true),
          or(isNull(adminBroadcasts.expiresAt), gte(adminBroadcasts.expiresAt, now))
        )
      )
      .orderBy(desc(adminBroadcasts.createdAt));
  }

  async getAllAdminBroadcasts(): Promise<AdminBroadcast[]> {
    return await db
      .select()
      .from(adminBroadcasts)
      .orderBy(desc(adminBroadcasts.createdAt));
  }

  async updateAdminBroadcast(id: string, data: Partial<AdminBroadcast>): Promise<AdminBroadcast> {
    const [broadcast] = await db
      .update(adminBroadcasts)
      .set(data)
      .where(eq(adminBroadcasts.id, id))
      .returning();
    return broadcast;
  }

  async deleteAdminBroadcast(id: string): Promise<void> {
    await db.delete(adminBroadcasts).where(eq(adminBroadcasts.id, id));
  }

  // Conversation Unread Counts
  async getConversationUnreadCount(conversationId: string, userId: string): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          ne(messages.senderId, userId),
          eq(messages.isRead, false)
        )
      );
    return result[0]?.count || 0;
  }

  // Pending Earnings
  async createPendingEarning(data: InsertPendingEarning): Promise<PendingEarning> {
    const [earning] = await db.insert(pendingEarnings).values(data).returning();
    return earning;
  }

  async getPendingEarningById(id: string): Promise<PendingEarning | undefined> {
    const [earning] = await db.select().from(pendingEarnings).where(eq(pendingEarnings.id, id));
    return earning;
  }

  async getPendingEarningsBySellerld(sellerId: string): Promise<PendingEarning[]> {
    return await db
      .select()
      .from(pendingEarnings)
      .where(eq(pendingEarnings.sellerId, sellerId))
      .orderBy(desc(pendingEarnings.createdAt));
  }

  async getAllPendingEarnings(): Promise<PendingEarning[]> {
    return await db
      .select()
      .from(pendingEarnings)
      .orderBy(desc(pendingEarnings.createdAt));
  }

  async getReleasablePendingEarnings(): Promise<PendingEarning[]> {
    const now = new Date();
    return await db
      .select()
      .from(pendingEarnings)
      .where(
        and(
          eq(pendingEarnings.status, "pending"),
          lte(pendingEarnings.releaseAt, now)
        )
      )
      .orderBy(asc(pendingEarnings.releaseAt));
  }

  async updatePendingEarning(id: string, data: Partial<PendingEarning>): Promise<PendingEarning> {
    const [earning] = await db
      .update(pendingEarnings)
      .set(data)
      .where(eq(pendingEarnings.id, id))
      .returning();
    return earning;
  }

  async releasePendingEarning(id: string, adminNote?: string): Promise<PendingEarning> {
    const [earning] = await db
      .update(pendingEarnings)
      .set({
        status: "released",
        releasedAt: new Date(),
        adminNote: adminNote || null,
      })
      .where(eq(pendingEarnings.id, id))
      .returning();
    return earning;
  }

  async cancelPendingEarning(id: string, adminNote?: string): Promise<PendingEarning> {
    const [earning] = await db
      .update(pendingEarnings)
      .set({
        status: "cancelled",
        releasedAt: new Date(),
        adminNote: adminNote || null,
      })
      .where(eq(pendingEarnings.id, id))
      .returning();
    return earning;
  }

  async getSellerPendingBalance(sellerId: string): Promise<string> {
    const result = await db
      .select({ total: sum(pendingEarnings.amount) })
      .from(pendingEarnings)
      .where(
        and(
          eq(pendingEarnings.sellerId, sellerId),
          eq(pendingEarnings.status, "pending")
        )
      );
    return result[0]?.total || "0";
  }
}

// Helper to hash UID for duplicate checking
export function hashUid(content: string): string {
  const uidMatch = content.split("|")[0];
  if (!uidMatch) return "";
  return crypto.createHash("sha256").update(uidMatch).digest("hex");
}

export const storage = new DatabaseStorage();
