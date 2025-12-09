import { sql, relations } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  timestamp,
  decimal,
  integer,
  boolean,
  jsonb,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const userRoleEnum = pgEnum("user_role", ["buyer", "seller", "admin"]);
export const userStatusEnum = pgEnum("user_status", ["active", "banned", "pending"]);
export const kycStatusEnum = pgEnum("kyc_status", ["pending", "approved", "rejected"]);
export const productCategoryEnum = pgEnum("product_category", ["account", "software"]);
export const productStatusEnum = pgEnum("product_status", ["draft", "pending_approval", "active", "disabled"]);
export const productItemStatusEnum = pgEnum("product_item_status", ["available", "reserved", "sold"]);
export const orderStatusEnum = pgEnum("order_status", ["pending_payment", "pending_confirmation", "paid", "cancelled", "refunded"]);
export const paymentMethodEnum = pgEnum("payment_method", ["qr", "wallet", "manual"]);
export const transactionTypeEnum = pgEnum("transaction_type", ["credit", "debit"]);
export const withdrawalStatusEnum = pgEnum("withdrawal_status", ["pending", "approved", "completed", "rejected"]);
export const depositStatusEnum = pgEnum("deposit_status", ["pending", "approved", "rejected"]);
export const conversationTypeEnum = pgEnum("conversation_type", ["support", "order_dispute", "seller_buyer"]);
export const messageTypeEnum = pgEnum("message_type", ["text", "image", "file", "system"]);
export const notificationTypeEnum = pgEnum("notification_type", ["new_order", "order_paid", "new_message", "kyc_update", "withdrawal_update", "deposit_update", "product_approved", "system", "referral_bonus", "flash_sale", "wishlist_price_drop", "warranty_claim", "dispute_update", "bundle_discount"]);
export const disputeStatusEnum = pgEnum("dispute_status", ["open", "investigating", "resolved_buyer", "resolved_seller", "closed"]);
export const warrantyStatusEnum = pgEnum("warranty_status", ["active", "claimed", "expired", "void"]);
export const warrantyClaimStatusEnum = pgEnum("warranty_claim_status", ["pending", "approved", "rejected", "processing"]);
export const pendingEarningStatusEnum = pgEnum("pending_earning_status", ["pending", "released", "cancelled"]);

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// Users table - supports buyer, seller, admin roles
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  role: userRoleEnum("role").notNull().default("buyer"),
  email: varchar("email").unique(),
  password: varchar("password"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  phone: varchar("phone"),
  profileImageUrl: varchar("profile_image_url"),
  status: userStatusEnum("status").notNull().default("active"),
  walletBalance: decimal("wallet_balance", { precision: 18, scale: 2 }).notNull().default("0.00"),
  lastSeenAt: timestamp("last_seen_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Sellers table - extended profile for sellers
export const sellers = pgTable("sellers", {
  id: varchar("id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  shopName: varchar("shop_name").notNull(),
  description: text("description"),
  kycStatus: kycStatusEnum("kyc_status").notNull().default("pending"),
  kycIdImage: varchar("kyc_id_image"),
  kycSelfieImage: varchar("kyc_selfie_image"),
  isShopLocked: boolean("is_shop_locked").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Products table
export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sellerId: varchar("seller_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title").notNull(),
  description: text("description"),
  category: productCategoryEnum("category").notNull(),
  platform: varchar("platform"),
  price: decimal("price", { precision: 18, scale: 2 }).notNull(),
  stock: integer("stock").notNull().default(0),
  status: productStatusEnum("status").notNull().default("draft"),
  thumbnailUrl: varchar("thumbnail_url"),
  thumbnailData: text("thumbnail_data"),
  isPinned: boolean("is_pinned").notNull().default(false),
  pinnedAt: timestamp("pinned_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Product Items - each account line is one item
export const productItems = pgTable("product_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  uidHash: varchar("uid_hash"),
  status: productItemStatusEnum("status").notNull().default("available"),
  reservedUntil: timestamp("reserved_until"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Files table - for software ZIP files
export const files = pgTable("files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").references(() => products.id, { onDelete: "cascade" }),
  filePath: varchar("file_path").notNull(),
  fileName: varchar("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Orders table
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderCode: varchar("order_code").unique(),
  buyerId: varchar("buyer_id").notNull().references(() => users.id),
  sellerId: varchar("seller_id").notNull().references(() => users.id),
  productId: varchar("product_id").notNull().references(() => products.id),
  productItemId: varchar("product_item_id").references(() => productItems.id),
  quantity: integer("quantity").notNull().default(1),
  price: decimal("price", { precision: 18, scale: 2 }).notNull(),
  paymentMethod: paymentMethodEnum("payment_method").notNull(),
  status: orderStatusEnum("status").notNull().default("pending_payment"),
  receiptUrl: varchar("receipt_url"),
  deliveredContent: text("delivered_content"),
  paymentConfirmedAt: timestamp("payment_confirmed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Wallet Transactions
export const walletTransactions = pgTable("wallet_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: transactionTypeEnum("type").notNull(),
  amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
  reason: varchar("reason"),
  relatedOrderId: varchar("related_order_id").references(() => orders.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Withdrawals
export const withdrawals = pgTable("withdrawals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sellerId: varchar("seller_id").notNull().references(() => users.id),
  amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
  bankInfo: jsonb("bank_info").notNull(),
  status: withdrawalStatusEnum("status").notNull().default("pending"),
  requestedAt: timestamp("requested_at").defaultNow(),
  processedAt: timestamp("processed_at"),
});

// Deposits - for wallet top-up with QR payment
export const deposits = pgTable("deposits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
  transactionCode: varchar("transaction_code").notNull(),
  proofImageUrl: varchar("proof_image_url"),
  status: depositStatusEnum("status").notNull().default("pending"),
  adminNote: text("admin_note"),
  requestedAt: timestamp("requested_at").defaultNow(),
  processedAt: timestamp("processed_at"),
});

// Admin Logs
export const adminLogs = pgTable("admin_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").references(() => users.id),
  action: varchar("action").notNull(),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at").defaultNow(),
});

// System Settings - for platform configuration
export const systemSettings = pgTable("system_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: varchar("key").notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Conversations - Chat between users
export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: conversationTypeEnum("type").notNull().default("support"),
  participant1Id: varchar("participant1_id").notNull().references(() => users.id),
  participant2Id: varchar("participant2_id").notNull().references(() => users.id),
  orderId: varchar("order_id").references(() => orders.id),
  subject: varchar("subject"),
  isActive: boolean("is_active").notNull().default(true),
  lastMessageAt: timestamp("last_message_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Messages
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  type: messageTypeEnum("type").notNull().default("text"),
  fileUrl: varchar("file_url"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Shop Reviews
export const reviews = pgTable("reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  buyerId: varchar("buyer_id").notNull().references(() => users.id),
  sellerId: varchar("seller_id").notNull().references(() => users.id),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  isVisible: boolean("is_visible").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// API Products - External products from taphoammo.net
export const apiProducts = pgTable("api_products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  kioskToken: varchar("kiosk_token").notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  platform: varchar("platform"),
  price: decimal("price", { precision: 18, scale: 2 }).notNull(),
  stock: integer("stock").notNull().default(0),
  thumbnailUrl: varchar("thumbnail_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Referrals - Referral system for user acquisition
export const referrals = pgTable("referrals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referrerId: varchar("referrer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  referredId: varchar("referred_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  referralCode: varchar("referral_code").notNull(),
  commissionRate: decimal("commission_rate", { precision: 5, scale: 2 }).notNull().default("5.00"),
  totalEarned: decimal("total_earned", { precision: 18, scale: 2 }).notNull().default("0.00"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// User Referral Codes - Each user has a unique referral code
export const userReferralCodes = pgTable("user_referral_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  code: varchar("code").notNull().unique(),
  totalReferrals: integer("total_referrals").notNull().default(0),
  totalEarnings: decimal("total_earnings", { precision: 18, scale: 2 }).notNull().default("0.00"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Flash Sales - Time-limited promotions
export const flashSales = pgTable("flash_sales", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title").notNull(),
  description: text("description"),
  discountPercent: integer("discount_percent").notNull(),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Flash Sale Products - Products included in flash sales
export const flashSaleProducts = pgTable("flash_sale_products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  flashSaleId: varchar("flash_sale_id").notNull().references(() => flashSales.id, { onDelete: "cascade" }),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  originalPrice: decimal("original_price", { precision: 18, scale: 2 }).notNull(),
  salePrice: decimal("sale_price", { precision: 18, scale: 2 }).notNull(),
  maxQuantity: integer("max_quantity"),
  soldQuantity: integer("sold_quantity").notNull().default(0),
});

// Wishlists - User saved products
export const wishlists = pgTable("wishlists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  priceAtAdd: decimal("price_at_add", { precision: 18, scale: 2 }).notNull(),
  notifyOnPriceDrop: boolean("notify_on_price_drop").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Product Bundles - Combo products with discounted pricing
export const bundles = pgTable("bundles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sellerId: varchar("seller_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title").notNull(),
  description: text("description"),
  originalPrice: decimal("original_price", { precision: 18, scale: 2 }).notNull(),
  bundlePrice: decimal("bundle_price", { precision: 18, scale: 2 }).notNull(),
  discountPercent: integer("discount_percent").notNull(),
  thumbnailUrl: varchar("thumbnail_url"),
  isActive: boolean("is_active").notNull().default(true),
  stock: integer("stock").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Bundle Items - Products included in a bundle
export const bundleItems = pgTable("bundle_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bundleId: varchar("bundle_id").notNull().references(() => bundles.id, { onDelete: "cascade" }),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull().default(1),
});

// Telegram Settings - User telegram integration
export const telegramSettings = pgTable("telegram_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  chatId: varchar("chat_id"),
  username: varchar("username"),
  isVerified: boolean("is_verified").notNull().default(false),
  verificationCode: varchar("verification_code"),
  notifyOrders: boolean("notify_orders").notNull().default(true),
  notifyMessages: boolean("notify_messages").notNull().default(true),
  notifyWithdrawals: boolean("notify_withdrawals").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Product Warranties - Warranty offered by sellers
export const warranties = pgTable("warranties", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: varchar("product_id").notNull().references(() => products.id),
  buyerId: varchar("buyer_id").notNull().references(() => users.id),
  sellerId: varchar("seller_id").notNull().references(() => users.id),
  warrantyDays: integer("warranty_days").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  status: warrantyStatusEnum("status").notNull().default("active"),
  terms: text("terms"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Warranty Claims - Claims made by buyers
export const warrantyClaims = pgTable("warranty_claims", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  warrantyId: varchar("warranty_id").notNull().references(() => warranties.id, { onDelete: "cascade" }),
  buyerId: varchar("buyer_id").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  evidence: text("evidence"),
  status: warrantyClaimStatusEnum("status").notNull().default("pending"),
  adminNote: text("admin_note"),
  resolution: text("resolution"),
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

// Disputes - Advanced dispute resolution
export const disputes = pgTable("disputes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  buyerId: varchar("buyer_id").notNull().references(() => users.id),
  sellerId: varchar("seller_id").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  buyerEvidence: text("buyer_evidence"),
  sellerResponse: text("seller_response"),
  sellerEvidence: text("seller_evidence"),
  status: disputeStatusEnum("status").notNull().default("open"),
  adminNote: text("admin_note"),
  resolution: text("resolution"),
  refundAmount: decimal("refund_amount", { precision: 18, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

// Pending Earnings - Hold seller earnings for 3 days
export const pendingEarnings = pgTable("pending_earnings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sellerId: varchar("seller_id").notNull().references(() => users.id),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
  status: pendingEarningStatusEnum("status").notNull().default("pending"),
  releaseAt: timestamp("release_at").notNull(),
  releasedAt: timestamp("released_at"),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Pricing Suggestions - Auto pricing based on market
export const pricingSuggestions = pgTable("pricing_suggestions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  suggestedPrice: decimal("suggested_price", { precision: 18, scale: 2 }).notNull(),
  minPrice: decimal("min_price", { precision: 18, scale: 2 }).notNull(),
  maxPrice: decimal("max_price", { precision: 18, scale: 2 }).notNull(),
  avgPrice: decimal("avg_price", { precision: 18, scale: 2 }).notNull(),
  competitorCount: integer("competitor_count").notNull().default(0),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Admin Broadcasts - Admin announcements to all users
export const adminBroadcasts = pgTable("admin_broadcasts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull().references(() => users.id),
  title: varchar("title").notNull(),
  message: text("message").notNull(),
  type: varchar("type").notNull().default("info"), // info, warning, promo
  isActive: boolean("is_active").notNull().default(true),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Notification Settings - User preferences for notifications
export const notificationSettings = pgTable("notification_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  newOrder: boolean("new_order").notNull().default(true),
  orderPaid: boolean("order_paid").notNull().default(true),
  newMessage: boolean("new_message").notNull().default(true),
  kycUpdate: boolean("kyc_update").notNull().default(true),
  withdrawalUpdate: boolean("withdrawal_update").notNull().default(true),
  depositUpdate: boolean("deposit_update").notNull().default(true),
  productApproved: boolean("product_approved").notNull().default(true),
  systemNotifications: boolean("system_notifications").notNull().default(true),
  emailNotifications: boolean("email_notifications").notNull().default(false),
  soundEnabled: boolean("sound_enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Notifications - Store individual notifications for users
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: notificationTypeEnum("type").notNull(),
  title: varchar("title").notNull(),
  message: text("message").notNull(),
  link: varchar("link"),
  isRead: boolean("is_read").notNull().default(false),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  seller: one(sellers, {
    fields: [users.id],
    references: [sellers.id],
  }),
  products: many(products),
  buyerOrders: many(orders, { relationName: "buyerOrders" }),
  sellerOrders: many(orders, { relationName: "sellerOrders" }),
  walletTransactions: many(walletTransactions),
  withdrawals: many(withdrawals),
}));

export const sellersRelations = relations(sellers, ({ one }) => ({
  user: one(users, {
    fields: [sellers.id],
    references: [users.id],
  }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  seller: one(users, {
    fields: [products.sellerId],
    references: [users.id],
  }),
  items: many(productItems),
  files: many(files),
  orders: many(orders),
}));

export const productItemsRelations = relations(productItems, ({ one }) => ({
  product: one(products, {
    fields: [productItems.productId],
    references: [products.id],
  }),
}));

export const filesRelations = relations(files, ({ one }) => ({
  product: one(products, {
    fields: [files.productId],
    references: [products.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
  buyer: one(users, {
    fields: [orders.buyerId],
    references: [users.id],
    relationName: "buyerOrders",
  }),
  seller: one(users, {
    fields: [orders.sellerId],
    references: [users.id],
    relationName: "sellerOrders",
  }),
  product: one(products, {
    fields: [orders.productId],
    references: [products.id],
  }),
  productItem: one(productItems, {
    fields: [orders.productItemId],
    references: [productItems.id],
  }),
}));

export const walletTransactionsRelations = relations(walletTransactions, ({ one }) => ({
  user: one(users, {
    fields: [walletTransactions.userId],
    references: [users.id],
  }),
  order: one(orders, {
    fields: [walletTransactions.relatedOrderId],
    references: [orders.id],
  }),
}));

export const withdrawalsRelations = relations(withdrawals, ({ one }) => ({
  seller: one(users, {
    fields: [withdrawals.sellerId],
    references: [users.id],
  }),
}));

export const depositsRelations = relations(deposits, ({ one }) => ({
  user: one(users, {
    fields: [deposits.userId],
    references: [users.id],
  }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  participant1: one(users, {
    fields: [conversations.participant1Id],
    references: [users.id],
    relationName: "participant1",
  }),
  participant2: one(users, {
    fields: [conversations.participant2Id],
    references: [users.id],
    relationName: "participant2",
  }),
  order: one(orders, {
    fields: [conversations.orderId],
    references: [orders.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
  }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  order: one(orders, {
    fields: [reviews.orderId],
    references: [orders.id],
  }),
  buyer: one(users, {
    fields: [reviews.buyerId],
    references: [users.id],
  }),
  seller: one(users, {
    fields: [reviews.sellerId],
    references: [users.id],
  }),
}));

export const notificationSettingsRelations = relations(notificationSettings, ({ one }) => ({
  user: one(users, {
    fields: [notificationSettings.userId],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const referralsRelations = relations(referrals, ({ one }) => ({
  referrer: one(users, {
    fields: [referrals.referrerId],
    references: [users.id],
    relationName: "referrer",
  }),
  referred: one(users, {
    fields: [referrals.referredId],
    references: [users.id],
    relationName: "referred",
  }),
}));

export const userReferralCodesRelations = relations(userReferralCodes, ({ one }) => ({
  user: one(users, {
    fields: [userReferralCodes.userId],
    references: [users.id],
  }),
}));

export const flashSalesRelations = relations(flashSales, ({ many }) => ({
  products: many(flashSaleProducts),
}));

export const flashSaleProductsRelations = relations(flashSaleProducts, ({ one }) => ({
  flashSale: one(flashSales, {
    fields: [flashSaleProducts.flashSaleId],
    references: [flashSales.id],
  }),
  product: one(products, {
    fields: [flashSaleProducts.productId],
    references: [products.id],
  }),
}));

export const wishlistsRelations = relations(wishlists, ({ one }) => ({
  user: one(users, {
    fields: [wishlists.userId],
    references: [users.id],
  }),
  product: one(products, {
    fields: [wishlists.productId],
    references: [products.id],
  }),
}));

export const bundlesRelations = relations(bundles, ({ one, many }) => ({
  seller: one(users, {
    fields: [bundles.sellerId],
    references: [users.id],
  }),
  items: many(bundleItems),
}));

export const bundleItemsRelations = relations(bundleItems, ({ one }) => ({
  bundle: one(bundles, {
    fields: [bundleItems.bundleId],
    references: [bundles.id],
  }),
  product: one(products, {
    fields: [bundleItems.productId],
    references: [products.id],
  }),
}));

export const telegramSettingsRelations = relations(telegramSettings, ({ one }) => ({
  user: one(users, {
    fields: [telegramSettings.userId],
    references: [users.id],
  }),
}));

export const warrantiesRelations = relations(warranties, ({ one, many }) => ({
  order: one(orders, {
    fields: [warranties.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [warranties.productId],
    references: [products.id],
  }),
  buyer: one(users, {
    fields: [warranties.buyerId],
    references: [users.id],
    relationName: "warrantyBuyer",
  }),
  seller: one(users, {
    fields: [warranties.sellerId],
    references: [users.id],
    relationName: "warrantySeller",
  }),
  claims: many(warrantyClaims),
}));

export const warrantyClaimsRelations = relations(warrantyClaims, ({ one }) => ({
  warranty: one(warranties, {
    fields: [warrantyClaims.warrantyId],
    references: [warranties.id],
  }),
  buyer: one(users, {
    fields: [warrantyClaims.buyerId],
    references: [users.id],
  }),
}));

export const disputesRelations = relations(disputes, ({ one }) => ({
  order: one(orders, {
    fields: [disputes.orderId],
    references: [orders.id],
  }),
  buyer: one(users, {
    fields: [disputes.buyerId],
    references: [users.id],
    relationName: "disputeBuyer",
  }),
  seller: one(users, {
    fields: [disputes.sellerId],
    references: [users.id],
    relationName: "disputeSeller",
  }),
}));

export const pricingSuggestionsRelations = relations(pricingSuggestions, ({ one }) => ({
  product: one(products, {
    fields: [pricingSuggestions.productId],
    references: [products.id],
  }),
}));

export const pendingEarningsRelations = relations(pendingEarnings, ({ one }) => ({
  seller: one(users, {
    fields: [pendingEarnings.sellerId],
    references: [users.id],
  }),
  order: one(orders, {
    fields: [pendingEarnings.orderId],
    references: [orders.id],
  }),
}));

// Insert Schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSellerSchema = createInsertSchema(sellers).omit({
  createdAt: true,
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProductItemSchema = createInsertSchema(productItems).omit({
  id: true,
  createdAt: true,
});

export const insertFileSchema = createInsertSchema(files).omit({
  id: true,
  createdAt: true,
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWalletTransactionSchema = createInsertSchema(walletTransactions).omit({
  id: true,
  createdAt: true,
});

export const insertWithdrawalSchema = createInsertSchema(withdrawals).omit({
  id: true,
  requestedAt: true,
  processedAt: true,
});

export const insertDepositSchema = createInsertSchema(deposits).omit({
  id: true,
  requestedAt: true,
  processedAt: true,
});

export const insertAdminLogSchema = createInsertSchema(adminLogs).omit({
  id: true,
  createdAt: true,
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
  lastMessageAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export const insertReviewSchema = createInsertSchema(reviews).omit({
  id: true,
  createdAt: true,
});

export const insertApiProductSchema = createInsertSchema(apiProducts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertNotificationSettingsSchema = createInsertSchema(notificationSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export const insertReferralSchema = createInsertSchema(referrals).omit({
  id: true,
  createdAt: true,
});

export const insertUserReferralCodeSchema = createInsertSchema(userReferralCodes).omit({
  id: true,
  createdAt: true,
});

export const insertFlashSaleSchema = createInsertSchema(flashSales).omit({
  id: true,
  createdAt: true,
});

export const insertFlashSaleProductSchema = createInsertSchema(flashSaleProducts).omit({
  id: true,
});

export const insertWishlistSchema = createInsertSchema(wishlists).omit({
  id: true,
  createdAt: true,
});

export const insertBundleSchema = createInsertSchema(bundles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBundleItemSchema = createInsertSchema(bundleItems).omit({
  id: true,
});

export const insertTelegramSettingsSchema = createInsertSchema(telegramSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWarrantySchema = createInsertSchema(warranties).omit({
  id: true,
  createdAt: true,
});

export const insertWarrantyClaimSchema = createInsertSchema(warrantyClaims).omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
});

export const insertDisputeSchema = createInsertSchema(disputes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
});

export const insertPricingSuggestionSchema = createInsertSchema(pricingSuggestions).omit({
  id: true,
  createdAt: true,
});

export const insertPendingEarningSchema = createInsertSchema(pendingEarnings).omit({
  id: true,
  createdAt: true,
  releasedAt: true,
});

export const insertAdminBroadcastSchema = createInsertSchema(adminBroadcasts).omit({
  id: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type UpsertUser = typeof users.$inferInsert;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Seller = typeof sellers.$inferSelect;
export type InsertSeller = z.infer<typeof insertSellerSchema>;

export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;

export type ProductItem = typeof productItems.$inferSelect;
export type InsertProductItem = z.infer<typeof insertProductItemSchema>;

export type File = typeof files.$inferSelect;
export type InsertFile = z.infer<typeof insertFileSchema>;

export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;

export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type InsertWalletTransaction = z.infer<typeof insertWalletTransactionSchema>;

export type Withdrawal = typeof withdrawals.$inferSelect;
export type InsertWithdrawal = z.infer<typeof insertWithdrawalSchema>;

export type Deposit = typeof deposits.$inferSelect;
export type InsertDeposit = z.infer<typeof insertDepositSchema>;

export type AdminLog = typeof adminLogs.$inferSelect;
export type InsertAdminLog = z.infer<typeof insertAdminLogSchema>;

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type Review = typeof reviews.$inferSelect;
export type InsertReview = z.infer<typeof insertReviewSchema>;

export type ApiProduct = typeof apiProducts.$inferSelect;
export type InsertApiProduct = z.infer<typeof insertApiProductSchema>;

export type NotificationSettings = typeof notificationSettings.$inferSelect;
export type InsertNotificationSettings = z.infer<typeof insertNotificationSettingsSchema>;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

export type Referral = typeof referrals.$inferSelect;
export type InsertReferral = z.infer<typeof insertReferralSchema>;

export type UserReferralCode = typeof userReferralCodes.$inferSelect;
export type InsertUserReferralCode = z.infer<typeof insertUserReferralCodeSchema>;

export type FlashSale = typeof flashSales.$inferSelect;
export type InsertFlashSale = z.infer<typeof insertFlashSaleSchema>;

export type FlashSaleProduct = typeof flashSaleProducts.$inferSelect;
export type InsertFlashSaleProduct = z.infer<typeof insertFlashSaleProductSchema>;

export type Wishlist = typeof wishlists.$inferSelect;
export type InsertWishlist = z.infer<typeof insertWishlistSchema>;

export type Bundle = typeof bundles.$inferSelect;
export type InsertBundle = z.infer<typeof insertBundleSchema>;

export type BundleItem = typeof bundleItems.$inferSelect;
export type InsertBundleItem = z.infer<typeof insertBundleItemSchema>;

export type TelegramSettings = typeof telegramSettings.$inferSelect;
export type InsertTelegramSettings = z.infer<typeof insertTelegramSettingsSchema>;

export type Warranty = typeof warranties.$inferSelect;
export type InsertWarranty = z.infer<typeof insertWarrantySchema>;

export type WarrantyClaim = typeof warrantyClaims.$inferSelect;
export type InsertWarrantyClaim = z.infer<typeof insertWarrantyClaimSchema>;

export type Dispute = typeof disputes.$inferSelect;
export type InsertDispute = z.infer<typeof insertDisputeSchema>;

export type PricingSuggestion = typeof pricingSuggestions.$inferSelect;
export type InsertPricingSuggestion = z.infer<typeof insertPricingSuggestionSchema>;

export type PendingEarning = typeof pendingEarnings.$inferSelect;
export type InsertPendingEarning = z.infer<typeof insertPendingEarningSchema>;

export type AdminBroadcast = typeof adminBroadcasts.$inferSelect;
export type InsertAdminBroadcast = z.infer<typeof insertAdminBroadcastSchema>;

// Bank Info Type
export type BankInfo = {
  bankName: string;
  accountNumber: string;
  accountName: string;
};

// Extended types with relations
export type ProductWithSeller = Product & {
  seller: User;
  items?: ProductItem[];
};

export type OrderWithDetails = Order & {
  buyer: User;
  seller: User;
  product: Product;
  productItem?: ProductItem;
};

export type SellerWithUser = Seller & {
  user: User;
};
