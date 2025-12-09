import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import express from "express";
import { storage, hashUid } from "./storage";
import { setupCustomAuth, isAuthenticated, requireRole } from "./customAuth";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

type NotificationType = 
  | "new_order" 
  | "order_paid" 
  | "new_message" 
  | "kyc_update" 
  | "withdrawal_update" 
  | "deposit_update" 
  | "product_approved" 
  | "system"
  | "referral_bonus"
  | "flash_sale"
  | "wishlist_price_drop"
  | "warranty_claim"
  | "dispute_update"
  | "bundle_discount";

async function sendNotification(
  userId: string, 
  type: NotificationType, 
  title: string, 
  message: string, 
  link?: string,
  metadata?: Record<string, unknown>
) {
  try {
    const settings = await storage.getNotificationSettings(userId);
    
    const typeSettingsMap: Record<NotificationType, string> = {
      new_order: "newOrder",
      order_paid: "orderPaid",
      new_message: "newMessage",
      kyc_update: "kycUpdate",
      withdrawal_update: "withdrawalUpdate",
      deposit_update: "depositUpdate",
      product_approved: "productApproved",
      system: "systemNotifications",
      referral_bonus: "systemNotifications",
      flash_sale: "systemNotifications",
      wishlist_price_drop: "systemNotifications",
      warranty_claim: "systemNotifications",
      dispute_update: "systemNotifications",
      bundle_discount: "systemNotifications",
    };
    
    const settingKey = typeSettingsMap[type] as keyof typeof settings;
    if (settings && settings[settingKey] === false) {
      return null;
    }
    
    return storage.createNotification({
      userId,
      type,
      title,
      message,
      link,
      metadata,
    });
  } catch (error) {
    console.error("Failed to send notification:", error);
    return null;
  }
}

// Setup multer for file uploads - use persistent directory
const uploadDir = process.env.UPLOAD_DIR || path.join(
  process.env.HOME || "/home/runner",
  ".data",
  "uploads"
);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const subDir = file.fieldname.includes("kyc") ? "kyc" : 
                     file.fieldname.includes("accounts") ? "accounts" : 
                     file.fieldname.includes("software") ? "software" : 
                     file.fieldname.includes("thumbnail") ? "thumbnails" : "misc";
      const fullDir = path.join(uploadDir, subDir);
      if (!fs.existsSync(fullDir)) {
        fs.mkdirSync(fullDir, { recursive: true });
      }
      cb(null, fullDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
      cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
    },
  }),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "thumbnail") {
      if (["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"].includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error("Chỉ hỗ trợ file ảnh (JPG, PNG, GIF, WebP, SVG)"));
      }
    } else {
      cb(null, true);
    }
  },
});

const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for thumbnails
  },
  fileFilter: (req, file, cb) => {
    if (["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Chỉ hỗ trợ file ảnh (JPG, PNG, GIF, WebP, SVG)"));
    }
  },
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup custom authentication
  await setupCustomAuth(app);

  // Serve uploaded files - thumbnails are public, other files require auth
  // Serve from project directory first (for production), then from data directory (for development)
  const projectThumbnailsDir = path.join(process.cwd(), "uploads", "thumbnails");
  app.use("/uploads/thumbnails", express.static(projectThumbnailsDir));
  app.use("/uploads/thumbnails", express.static(path.join(uploadDir, "thumbnails")));
  
  // Protected uploads (KYC, software, accounts, etc.)
  app.use("/uploads", (req, res, next) => {
    // Allow thumbnails without auth (already handled above)
    if (req.path.startsWith("/thumbnails")) {
      return next();
    }
    // Only allow authenticated users to access other uploads
    const userId = (req.session as any)?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  }, express.static(uploadDir));

  // ========== AUTH ROUTES ==========
  app.get("/api/auth/user", async (req: Request, res: Response) => {
    const userId = (req.session as any)?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Also get seller info if user is a seller
    if (user.role === "seller") {
      const seller = await storage.getSeller(userId);
      return res.json({ ...user, seller });
    }

    res.json(user);
  });

  // ========== PRODUCT ROUTES ==========
  app.get("/api/products", async (req: Request, res: Response) => {
    try {
      const { category, platform, search, limit } = req.query;
      const products = await storage.getProducts({
        category: category as string,
        platform: platform as string,
      });

      let filteredProducts = products;

      // Search filter
      if (search) {
        const query = (search as string).toLowerCase();
        filteredProducts = products.filter(
          (p) =>
            p.title.toLowerCase().includes(query) ||
            p.description?.toLowerCase().includes(query) ||
            p.platform?.toLowerCase().includes(query)
        );
      }

      // Limit
      if (limit) {
        filteredProducts = filteredProducts.slice(0, parseInt(limit as string));
      }

      res.json(filteredProducts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/products/:id", async (req: Request, res: Response) => {
    try {
      const product = await storage.getProductWithSeller(req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(product);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== ORDER ROUTES ==========
  app.get("/api/orders", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const orders = await storage.getBuyerOrders(userId);
      res.json(orders);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/orders", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const { productId, quantity = 1, paymentMethod = "qr" } = req.body;

      const product = await storage.getProductWithSeller(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Software products have unlimited stock (just a file download)
      // Only check stock for account products
      if (product.category === "account" && product.stock < quantity) {
        return res.status(400).json({ message: "Not enough stock" });
      }

      // For account products, try to reserve an item if available
      let productItemId: string | undefined;
      if (product.category === "account") {
        const item = await storage.getAvailableProductItem(productId);
        if (item) {
          // Reserve for 30 minutes
          const reservedUntil = new Date(Date.now() + 30 * 60 * 1000);
          await storage.reserveProductItem(item.id, reservedUntil);
          productItemId = item.id;
        }
        // Allow order creation even without items - seller will deliver manually
      }

      const totalPrice = (parseFloat(product.price) * quantity).toFixed(2);

      // Handle wallet payment - deduct immediately and auto-deliver
      if (paymentMethod === "wallet") {
        const buyer = await storage.getUser(userId);
        if (!buyer || parseFloat(buyer.walletBalance) < parseFloat(totalPrice)) {
          return res.status(400).json({ message: "Số dư ví không đủ. Vui lòng nạp thêm tiền để mua hàng." });
        }

        // For account products, check if enough items are available BEFORE processing
        let deliveredContent = "";
        const soldItemIds: string[] = [];
        if (product.category === "account") {
          const items = await storage.getAvailableProductItems(productId, quantity);
          if (items.length < quantity) {
            return res.status(400).json({ 
              message: `Không đủ sản phẩm. Chỉ còn ${items.length} sản phẩm có sẵn.` 
            });
          }
          // Mark items as sold
          for (const item of items) {
            await storage.updateProductItemStatus(item.id, "sold");
            soldItemIds.push(item.id);
          }
          deliveredContent = items.map(item => item.content).join("\n");
        }

        // Deduct from buyer's wallet
        const newBuyerBalance = (parseFloat(buyer.walletBalance) - parseFloat(totalPrice)).toFixed(2);
        await storage.updateUserBalance(userId, newBuyerBalance);

        // Create wallet transaction
        await storage.createWalletTransaction({
          userId,
          type: "debit",
          amount: totalPrice,
          reason: `Mua: ${product.title} (x${quantity})`,
        });

        // Create order with paid status (auto-delivered for wallet payments)
        const order = await storage.createOrder({
          buyerId: userId,
          sellerId: product.sellerId,
          productId,
          productItemId: soldItemIds[0], // Store first item ID
          quantity,
          price: totalPrice,
          paymentMethod: paymentMethod as any,
          status: "paid", // Auto-paid for wallet payments
        });

        // Deliver all accounts content
        if (deliveredContent) {
          await storage.updateOrderDeliveredContent(order.id, deliveredContent);
        }

        // Update product stock (only for account products, software has unlimited stock)
        if (product.category === "account") {
          await storage.updateProductStock(productId, product.stock - quantity);
        }

        // Calculate 5% platform commission
        const commissionRate = 0.05;
        const commissionAmount = (parseFloat(totalPrice) * commissionRate).toFixed(2);
        const sellerAmount = (parseFloat(totalPrice) * (1 - commissionRate)).toFixed(2);

        // Create pending earning instead of immediate credit (3 days hold) - with 5% commission deducted
        const releaseDate = new Date();
        releaseDate.setDate(releaseDate.getDate() + 3);
        
        await storage.createPendingEarning({
          sellerId: product.sellerId,
          orderId: order.id,
          amount: sellerAmount, // Seller receives 95% after 5% platform fee
          status: "pending",
          releaseAt: releaseDate,
        });

        // Log platform commission for tracking
        await storage.createAdminLog({
          action: "platform_commission",
          meta: {
            orderId: order.id,
            orderPrice: totalPrice,
            commissionAmount,
            sellerAmount,
          },
        });

        // Send notifications
        await sendNotification(
          userId,
          "order_paid",
          "Đơn hàng đã thanh toán thành công",
          `Đơn hàng #${order.orderCode} cho sản phẩm "${product.title}" đã được thanh toán. Kiểm tra nội dung đã giao.`,
          "/dashboard",
          { orderId: order.id, orderCode: order.orderCode }
        );
        
        await sendNotification(
          product.sellerId,
          "new_order",
          "Bạn có đơn hàng mới đã thanh toán",
          `Đơn hàng #${order.orderCode} cho sản phẩm "${product.title}" đã được thanh toán. Tiền sẽ được chuyển vào ví sau 3 ngày.`,
          "/seller",
          { orderId: order.id, orderCode: order.orderCode }
        );

        // Check if buyer was referred and calculate referral commission
        try {
          const referral = await storage.getReferralByReferredId(userId);
          if (referral && referral.isActive) {
            // Default to 5% if commissionRate is not set
            const rate = parseFloat(referral.commissionRate || "5.00");
            const referralCommissionRate = isNaN(rate) ? 0.05 : rate / 100;
            const referralCommission = (parseFloat(totalPrice) * referralCommissionRate).toFixed(2);
            
            if (parseFloat(referralCommission) > 0) {
              const referrer = await storage.getUser(referral.referrerId);
              if (referrer) {
                // Credit referrer's wallet using SQL to maintain numeric consistency
                await storage.creditUserWallet(referral.referrerId, referralCommission);
                
                await storage.createWalletTransaction({
                  userId: referral.referrerId,
                  amount: referralCommission,
                  type: "credit",
                  reason: `Hoa hồng giới thiệu từ đơn hàng #${order.orderCode}`,
                  relatedOrderId: order.id,
                });
                
                await storage.updateReferralEarnings(referral.id, referralCommission);
                await storage.updateReferrerTotalEarnings(referral.referrerId, referralCommission);
                
                await sendNotification(
                  referral.referrerId,
                  "referral_bonus",
                  "Bạn nhận được hoa hồng giới thiệu!",
                  `Bạn nhận được ${parseInt(referralCommission).toLocaleString("vi-VN")}đ hoa hồng từ đơn hàng của người bạn giới thiệu.`,
                  "/referral",
                  { amount: referralCommission, orderId: order.id }
                );
                
                console.log(`Referral commission paid: ${referralCommission} to ${referral.referrerId}`);
              }
            }
          }
        } catch (refError) {
          console.error("Error processing referral commission:", refError);
        }

        return res.status(201).json(order);
      }

      // QR payment - create pending order
      const order = await storage.createOrder({
        buyerId: userId,
        sellerId: product.sellerId,
        productId,
        productItemId,
        quantity,
        price: totalPrice,
        paymentMethod: paymentMethod as any,
        status: "pending_payment",
      });

      res.status(201).json(order);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/orders/:id/confirm-payment", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const order = await storage.getOrder(req.params.id);

      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.buyerId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      if (order.status !== "pending_payment") {
        return res.status(400).json({ message: "Order is not pending payment" });
      }

      // Update order status to pending_confirmation so admin can see it
      await storage.updateOrderStatus(req.params.id, "pending_confirmation");
      
      // Record payment confirmation timestamp
      await storage.updateOrderPaymentConfirmation(req.params.id, new Date());

      res.json({ message: "Payment confirmation submitted", status: "pending_confirmation" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== SELLER ROUTES ==========
  app.get("/api/seller/profile", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const seller = await storage.getSeller(userId);
      
      if (!seller) {
        return res.status(404).json({ message: "Seller profile not found" });
      }

      res.json(seller);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post(
    "/api/seller/register",
    isAuthenticated,
    upload.fields([
      { name: "kycIdImage", maxCount: 1 },
      { name: "kycSelfieImage", maxCount: 1 },
    ]),
    async (req: Request, res: Response) => {
      try {
        const userId = (req.user as any).id;
        const { shopName, description, phone } = req.body;
        const files = req.files as { [fieldname: string]: Express.Multer.File[] };

        // Check if already a seller
        const existingSeller = await storage.getSeller(userId);
        if (existingSeller) {
          return res.status(400).json({ message: "Already registered as seller" });
        }

        // Update user role and phone
        await storage.upsertUser({
          id: userId,
          role: "seller",
          phone,
        });

        // Create seller profile
        const kycIdImage = files?.kycIdImage?.[0] ? `/uploads/kyc/${files.kycIdImage[0].filename}` : undefined;
        const kycSelfieImage = files?.kycSelfieImage?.[0] ? `/uploads/kyc/${files.kycSelfieImage[0].filename}` : undefined;

        const seller = await storage.createSeller({
          id: userId,
          shopName,
          description,
          kycIdImage,
          kycSelfieImage,
          kycStatus: "pending",
        });

        res.status(201).json(seller);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.get("/api/seller/products", isAuthenticated, requireRole(["seller", "admin"]), async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const products = await storage.getSellerProducts(userId);
      res.json(products);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post(
    "/api/seller/products",
    isAuthenticated,
    requireRole(["seller"]),
    upload.fields([
      { name: "accountsFile", maxCount: 1 },
      { name: "softwareFile", maxCount: 1 },
      { name: "thumbnail", maxCount: 1 },
    ]),
    async (req: Request, res: Response) => {
      try {
        const userId = (req.user as any).id;
        const { title, description, category, platform, price, manualAccounts } = req.body;
        const files = req.files as { [fieldname: string]: Express.Multer.File[] };

        // Check KYC status
        const seller = await storage.getSeller(userId);
        if (!seller || seller.kycStatus !== "approved") {
          return res.status(403).json({ message: "KYC must be approved to create products" });
        }

        let accounts: string[] = [];

        // Parse accounts from file or manual input
        if (category === "account") {
          if (files?.accountsFile?.[0]) {
            const content = fs.readFileSync(files.accountsFile[0].path, "utf-8");
            accounts = content.split("\n").filter((line) => line.trim());
          } else if (manualAccounts) {
            accounts = manualAccounts.split("\n").filter((line: string) => line.trim());
          }

          // Check for duplicates
          for (const account of accounts) {
            const uid = hashUid(account);
            if (uid) {
              const isDuplicate = await storage.checkDuplicateUid(uid);
              if (isDuplicate) {
                return res.status(400).json({ 
                  message: `Duplicate account detected: ${account.substring(0, 20)}...` 
                });
              }
            }
          }
        }

        // Validate: account products must have accounts
        if (category === "account" && accounts.length === 0) {
          return res.status(400).json({ 
            message: "Sản phẩm tài khoản phải có ít nhất 1 tài khoản" 
          });
        }

        // Get thumbnail URL
        const thumbnailUrl = files?.thumbnail?.[0] ? `/uploads/thumbnails/${files.thumbnail[0].filename}` : undefined;

        // Create product
        // Software products have unlimited stock (999999), account products = number of uploaded items
        const product = await storage.createProduct({
          sellerId: userId,
          title,
          description,
          category: category as any,
          platform,
          price,
          stock: category === "account" ? accounts.length : 999999,
          status: "pending_approval",
          thumbnailUrl,
        });

        // Create product items for accounts
        if (category === "account" && accounts.length > 0) {
          const items = accounts.map((content) => ({
            productId: product.id,
            content,
            uidHash: hashUid(content),
            status: "available" as const,
          }));
          await storage.createProductItems(items);
        }

        // Handle software file
        if (category === "software" && files?.softwareFile?.[0]) {
          await storage.createFile({
            productId: product.id,
            filePath: `/uploads/software/${files.softwareFile[0].filename}`,
            fileName: files.softwareFile[0].originalname,
            fileSize: files.softwareFile[0].size,
          });
        }

        res.status(201).json(product);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  app.patch(
    "/api/seller/products/:id/restock",
    isAuthenticated,
    requireRole(["seller"]),
    upload.single("accountsFile"),
    async (req: Request, res: Response) => {
      try {
        const userId = (req.user as any).id;
        const { manualAccounts } = req.body;
        
        const product = await storage.getProduct(req.params.id);
        if (!product || product.sellerId !== userId) {
          return res.status(403).json({ message: "Not authorized" });
        }

        if (product.category === "account") {
          // For account products, need to upload accounts
          let accounts: string[] = [];
          
          if (req.file) {
            const content = fs.readFileSync(req.file.path, "utf-8");
            accounts = content.split("\n").filter((line) => line.trim());
          } else if (manualAccounts) {
            accounts = manualAccounts.split("\n").filter((line: string) => line.trim());
          } else {
            return res.status(400).json({ message: "Phải upload file hoặc nhập tài khoản" });
          }

          // Check for duplicates
          for (const account of accounts) {
            const uid = hashUid(account);
            if (uid) {
              const isDuplicate = await storage.checkDuplicateUid(uid);
              if (isDuplicate) {
                return res.status(400).json({ 
                  message: `Tài khoản trùng: ${account.substring(0, 20)}...` 
                });
              }
            }
          }

          // Create product items for new accounts
          const items = accounts.map((content) => ({
            productId: product.id,
            content,
            uidHash: hashUid(content),
            status: "available" as const,
          }));
          await storage.createProductItems(items);

          // Update product stock
          const newStock = product.stock + accounts.length;
          const updated = await storage.updateProductStock(req.params.id, newStock);
          res.json(updated);
        } else {
          res.status(400).json({ message: "Chỉ sản phẩm tài khoản có thể thêm hàng" });
        }
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  // Get product items (inventory) for a seller's product
  app.get("/api/seller/products/:id/items", isAuthenticated, requireRole(["seller", "admin"]), async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const product = await storage.getProduct(req.params.id);
      
      if (!product) {
        return res.status(404).json({ message: "Sản phẩm không tồn tại" });
      }
      
      // Check if seller owns this product (or is admin)
      if (product.sellerId !== userId && (req.user as any).role !== "admin") {
        return res.status(403).json({ message: "Không có quyền truy cập" });
      }

      const items = await storage.getProductItems(req.params.id);
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Delete a product item from inventory
  app.delete("/api/seller/products/:productId/items/:itemId", isAuthenticated, requireRole(["seller", "admin"]), async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const { productId, itemId } = req.params;
      
      const product = await storage.getProduct(productId);
      if (!product) {
        return res.status(404).json({ message: "Sản phẩm không tồn tại" });
      }
      
      // Check if seller owns this product
      if (product.sellerId !== userId && (req.user as any).role !== "admin") {
        return res.status(403).json({ message: "Không có quyền truy cập" });
      }

      const item = await storage.getProductItem(itemId);
      if (!item || item.productId !== productId) {
        return res.status(404).json({ message: "Item không tồn tại" });
      }

      // Only allow deletion of available items
      if (item.status !== "available") {
        return res.status(400).json({ message: "Chỉ có thể xóa item còn trong kho (available)" });
      }

      await storage.deleteProductItem(itemId);
      
      // Update product stock
      const newStock = Math.max(0, product.stock - 1);
      await storage.updateProductStock(productId, newStock);

      res.json({ message: "Xóa thành công" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Update a product item content
  app.patch("/api/seller/products/:productId/items/:itemId", isAuthenticated, requireRole(["seller", "admin"]), async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const { productId, itemId } = req.params;
      const { content } = req.body;
      
      if (!content || !content.trim()) {
        return res.status(400).json({ message: "Nội dung không được để trống" });
      }

      const product = await storage.getProduct(productId);
      if (!product) {
        return res.status(404).json({ message: "Sản phẩm không tồn tại" });
      }
      
      // Check if seller owns this product
      if (product.sellerId !== userId && (req.user as any).role !== "admin") {
        return res.status(403).json({ message: "Không có quyền truy cập" });
      }

      const item = await storage.getProductItem(itemId);
      if (!item || item.productId !== productId) {
        return res.status(404).json({ message: "Item không tồn tại" });
      }

      // Only allow editing of available items
      if (item.status !== "available") {
        return res.status(400).json({ message: "Chỉ có thể sửa item còn trong kho (available)" });
      }

      // Check for duplicate content
      const newUidHash = hashUid(content.trim());
      if (newUidHash && item.uidHash !== newUidHash) {
        const isDuplicate = await storage.checkDuplicateUid(newUidHash);
        if (isDuplicate) {
          return res.status(400).json({ message: "Tài khoản này đã tồn tại trong hệ thống" });
        }
      }

      const updated = await storage.updateProductItemContent(itemId, content.trim());
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Delete multiple product items at once
  app.post("/api/seller/products/:productId/items/bulk-delete", isAuthenticated, requireRole(["seller", "admin"]), async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const { productId } = req.params;
      const { itemIds } = req.body;
      
      if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ message: "Vui lòng chọn ít nhất một item để xóa" });
      }

      const product = await storage.getProduct(productId);
      if (!product) {
        return res.status(404).json({ message: "Sản phẩm không tồn tại" });
      }
      
      // Check if seller owns this product
      if (product.sellerId !== userId && (req.user as any).role !== "admin") {
        return res.status(403).json({ message: "Không có quyền truy cập" });
      }

      let deletedCount = 0;
      for (const itemId of itemIds) {
        const item = await storage.getProductItem(itemId);
        if (item && item.productId === productId && item.status === "available") {
          await storage.deleteProductItem(itemId);
          deletedCount++;
        }
      }

      // Update product stock
      const newStock = Math.max(0, product.stock - deletedCount);
      await storage.updateProductStock(productId, newStock);

      res.json({ message: `Đã xóa ${deletedCount} item`, deletedCount });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/seller/orders", isAuthenticated, requireRole(["seller"]), async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const orders = await storage.getSellerOrders(userId);
      res.json(orders);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/seller/orders/:id", isAuthenticated, requireRole(["seller"]), async (req: Request, res: Response) => {
    try {
      const order = await storage.getOrderWithDetails(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Đơn hàng không tồn tại" });
      }

      // Check if seller owns this order
      if (order.sellerId !== (req.user as any).id) {
        return res.status(403).json({ message: "Bạn không có quyền xóa đơn hàng này" });
      }

      // Only allow deletion if order is in pending_payment status
      if (order.status !== "pending_payment") {
        return res.status(400).json({ message: "Chỉ có thể xóa đơn hàng chưa thanh toán" });
      }

      await storage.deleteOrder(req.params.id);
      res.json({ message: "Xóa thành công" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/seller/withdrawals", isAuthenticated, requireRole(["seller"]), async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const withdrawals = await storage.getSellerWithdrawals(userId);
      res.json(withdrawals);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/seller/withdrawals", isAuthenticated, requireRole(["seller"]), async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const { amount, bankName, accountNumber, accountName } = req.body;

      // Check balance
      const user = await storage.getUser(userId);
      if (!user || parseFloat(user.walletBalance) < parseFloat(amount)) {
        return res.status(400).json({ message: "Insufficient balance" });
      }

      // Check KYC
      const seller = await storage.getSeller(userId);
      if (!seller || seller.kycStatus !== "approved") {
        return res.status(403).json({ message: "KYC must be approved to withdraw" });
      }

      const withdrawal = await storage.createWithdrawal({
        sellerId: userId,
        amount,
        bankInfo: { bankName, accountNumber, accountName },
        status: "pending",
      });

      res.status(201).json(withdrawal);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== ADMIN ROUTES ==========
  app.get("/api/admin/stats", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const stats = await storage.getAdminStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/kyc/pending", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const sellers = await storage.getPendingKycSellers();
      res.json(sellers);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/kyc/:id/approve", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const seller = await storage.updateSellerKycStatus(req.params.id, "approved");
      
      await storage.createAdminLog({
        adminId: (req.user as any).id,
        action: "kyc_approved",
        meta: { sellerId: req.params.id },
      });

      await sendNotification(
        req.params.id,
        "kyc_update",
        "KYC đã được phê duyệt",
        "Chúc mừng! Hồ sơ KYC của bạn đã được phê duyệt. Bạn có thể bắt đầu bán hàng ngay bây giờ.",
        "/seller"
      );

      res.json(seller);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/kyc/:id/reject", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const seller = await storage.updateSellerKycStatus(req.params.id, "rejected");
      
      await storage.createAdminLog({
        adminId: (req.user as any).id,
        action: "kyc_rejected",
        meta: { sellerId: req.params.id },
      });

      await sendNotification(
        req.params.id,
        "kyc_update",
        "KYC bị từ chối",
        "Hồ sơ KYC của bạn đã bị từ chối. Vui lòng kiểm tra lại thông tin và nộp lại.",
        "/seller/register"
      );

      res.json(seller);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/products/pending", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const products = await storage.getPendingProducts();
      res.json(products);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/products/:id/approve", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const existingProduct = await storage.getProduct(req.params.id);
      const product = await storage.updateProductStatus(req.params.id, "active");
      
      await storage.createAdminLog({
        adminId: (req.user as any).id,
        action: "product_approved",
        meta: { productId: req.params.id },
      });

      if (existingProduct) {
        await sendNotification(
          existingProduct.sellerId,
          "product_approved",
          "Sản phẩm đã được phê duyệt",
          `Sản phẩm "${existingProduct.title}" của bạn đã được phê duyệt và hiển thị trên cửa hàng.`,
          "/seller",
          { productId: existingProduct.id }
        );
      }

      res.json(product);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/products/:id/reject", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const existingProduct = await storage.getProduct(req.params.id);
      const product = await storage.updateProductStatus(req.params.id, "disabled");
      
      await storage.createAdminLog({
        adminId: (req.user as any).id,
        action: "product_rejected",
        meta: { productId: req.params.id },
      });

      if (existingProduct) {
        await sendNotification(
          existingProduct.sellerId,
          "product_approved",
          "Sản phẩm bị từ chối",
          `Sản phẩm "${existingProduct.title}" của bạn đã bị từ chối. Vui lòng kiểm tra và cập nhật lại.`,
          "/seller",
          { productId: existingProduct.id }
        );
      }

      res.json(product);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/admin/products/:id", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      await storage.deleteProduct(req.params.id);
      await storage.createAdminLog({
        adminId: (req.user as any).id,
        action: "product_deleted",
        meta: { productId: req.params.id },
      });
      res.json({ message: "Product deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get all products for admin (with seller info)
  app.get("/api/admin/products/all", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const products = await storage.getAllProductsAdmin();
      res.json(products);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Edit product (admin)
  app.patch("/api/admin/products/:id", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const { title, description, price, status, category, platform } = req.body;
      const product = await storage.updateProductAdmin(req.params.id, {
        title,
        description,
        price,
        status,
        category,
        platform,
      });
      
      await storage.createAdminLog({
        adminId: (req.user as any).id,
        action: "product_edited",
        meta: { productId: req.params.id, changes: req.body },
      });
      
      res.json(product);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin upload product thumbnail - store as base64 in database for persistence
  app.post("/api/admin/products/:id/thumbnail", isAuthenticated, requireRole(["admin"]), uploadMemory.single("thumbnail"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Vui lòng chọn file ảnh" });
      }

      const base64Data = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
      
      const product = await storage.updateProductAdmin(req.params.id, {
        thumbnailData: base64Data,
        thumbnailUrl: `/api/products/${req.params.id}/thumbnail?v=${Date.now()}`,
      });
      
      await storage.createAdminLog({
        adminId: (req.user as any).id,
        action: "product_thumbnail_updated",
        meta: { productId: req.params.id },
      });
      
      res.json(product);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Serve product thumbnail from database
  app.get("/api/products/:id/thumbnail", async (req: Request, res: Response) => {
    try {
      const product = await storage.getProduct(req.params.id);
      if (!product || !product.thumbnailData) {
        return res.status(404).json({ message: "Thumbnail not found" });
      }
      
      const matches = product.thumbnailData.match(/^data:(.+);base64,(.+)$/);
      if (!matches) {
        return res.status(500).json({ message: "Invalid thumbnail data" });
      }
      
      const contentType = matches[1];
      const buffer = Buffer.from(matches[2], "base64");
      
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=31536000");
      res.send(buffer);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Pin/unpin product
  app.post("/api/admin/products/:id/pin", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const { isPinned } = req.body;
      const product = await storage.updateProductPin(req.params.id, isPinned);
      
      await storage.createAdminLog({
        adminId: (req.user as any).id,
        action: isPinned ? "product_pinned" : "product_unpinned",
        meta: { productId: req.params.id },
      });
      
      res.json(product);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/seller/products/:id", isAuthenticated, requireRole(["seller"]), async (req: Request, res: Response) => {
    try {
      const product = await storage.getProduct(req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      if (product.sellerId !== (req.user as any).id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      // Delete product and all related data (orders, items)
      await storage.deleteProductWithRelations(req.params.id);
      res.json({ message: "Đã xóa sản phẩm và tất cả dữ liệu liên quan" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/orders/pending", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const orders = await storage.getPendingOrders();
      res.json(orders);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/orders/all", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const allOrders = await storage.getAllOrders();
      res.json(allOrders);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/orders/:id/confirm", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const order = await storage.getOrderWithDetails(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Update order status to paid
      await storage.updateOrderStatus(req.params.id, "paid");

      // Mark product item as sold and deliver content (for account products)
      if (order.productItemId && order.productItem) {
        await storage.updateProductItemStatus(order.productItemId, "sold");
        await storage.updateOrderDeliveredContent(req.params.id, order.productItem.content);
      }

      // Update product stock (only for account products, software has unlimited stock)
      if (order.product.category === "account") {
        await storage.updateProductStock(order.productId, order.product.stock - order.quantity);
      }

      // Calculate 5% platform commission
      const commissionRate = 0.05;
      const commissionAmount = (parseFloat(order.price) * commissionRate).toFixed(2);
      const sellerAmount = (parseFloat(order.price) * (1 - commissionRate)).toFixed(2);

      // Create pending earning instead of immediate credit (3 days hold) - with 5% commission deducted
      const releaseDate = new Date();
      releaseDate.setDate(releaseDate.getDate() + 3);
      
      await storage.createPendingEarning({
        sellerId: order.sellerId,
        orderId: order.id,
        amount: sellerAmount, // Seller receives 95% after 5% platform fee
        status: "pending",
        releaseAt: releaseDate,
      });

      // Log platform commission for tracking
      await storage.createAdminLog({
        adminId: (req.user as any).id,
        action: "platform_commission",
        meta: { 
          orderId: req.params.id,
          orderPrice: order.price,
          commissionAmount,
          sellerAmount,
        },
      });

      await storage.createAdminLog({
        adminId: (req.user as any).id,
        action: "order_confirmed",
        meta: { orderId: req.params.id },
      });

      await sendNotification(
        order.buyerId,
        "order_paid",
        "Đơn hàng đã thanh toán thành công",
        `Đơn hàng #${order.orderCode} cho sản phẩm "${order.product.title}" đã được xác nhận. Kiểm tra nội dung đã giao.`,
        "/dashboard",
        { orderId: order.id, orderCode: order.orderCode }
      );
      
      await sendNotification(
        order.sellerId,
        "new_order",
        "Bạn có đơn hàng mới đã thanh toán",
        `Đơn hàng #${order.orderCode} cho sản phẩm "${order.product.title}" đã được thanh toán. Tiền sẽ được chuyển vào ví sau 3 ngày.`,
        "/seller",
        { orderId: order.id, orderCode: order.orderCode }
      );

      // Check if buyer was referred and calculate referral commission
      try {
        const referral = await storage.getReferralByReferredId(order.buyerId);
        if (referral && referral.isActive) {
          // Default to 5% if commissionRate is not set
          const rate = parseFloat(referral.commissionRate || "5.00");
          const referralCommissionRate = isNaN(rate) ? 0.05 : rate / 100;
          const referralCommission = (parseFloat(order.price) * referralCommissionRate).toFixed(2);
          
          if (parseFloat(referralCommission) > 0) {
            const referrer = await storage.getUser(referral.referrerId);
            if (referrer) {
              // Credit referrer's wallet using SQL to maintain numeric consistency
              await storage.creditUserWallet(referral.referrerId, referralCommission);
              
              await storage.createWalletTransaction({
                userId: referral.referrerId,
                amount: referralCommission,
                type: "credit",
                reason: `Hoa hồng giới thiệu từ đơn hàng #${order.orderCode}`,
                relatedOrderId: order.id,
              });
              
              await storage.updateReferralEarnings(referral.id, referralCommission);
              await storage.updateReferrerTotalEarnings(referral.referrerId, referralCommission);
              
              await sendNotification(
                referral.referrerId,
                "referral_bonus",
                "Bạn nhận được hoa hồng giới thiệu!",
                `Bạn nhận được ${parseInt(referralCommission).toLocaleString("vi-VN")}đ hoa hồng từ đơn hàng của người bạn giới thiệu.`,
                "/referral",
                { amount: referralCommission, orderId: order.id }
              );
              
              console.log(`Referral commission paid: ${referralCommission} to ${referral.referrerId}`);
            }
          }
        }
      } catch (refError) {
        console.error("Error processing referral commission:", refError);
      }

      res.json({ message: "Order confirmed" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/orders/:id/cancel", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const order = await storage.getOrderWithDetails(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Update order status
      await storage.updateOrderStatus(req.params.id, "cancelled");

      // Release reserved item
      if (order.productItemId) {
        await storage.updateProductItemStatus(order.productItemId, "available");
      }

      await storage.createAdminLog({
        adminId: (req.user as any).id,
        action: "order_cancelled",
        meta: { orderId: req.params.id },
      });

      res.json({ message: "Order cancelled" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/withdrawals/pending", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const withdrawals = await storage.getPendingWithdrawals();
      res.json(withdrawals);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/withdrawals/:id/approve", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const withdrawal = await storage.getWithdrawal(req.params.id);
      if (!withdrawal) {
        return res.status(404).json({ message: "Withdrawal not found" });
      }

      await storage.updateWithdrawalStatus(req.params.id, "approved");

      await storage.createAdminLog({
        adminId: (req.user as any).id,
        action: "withdrawal_approved",
        meta: { withdrawalId: req.params.id },
      });

      await sendNotification(
        withdrawal.sellerId,
        "withdrawal_update",
        "Yêu cầu rút tiền đã được duyệt",
        `Yêu cầu rút ${parseFloat(withdrawal.amount).toLocaleString("vi-VN")}đ đã được phê duyệt. Đang chờ xử lý.`,
        "/seller",
        { withdrawalId: req.params.id, amount: withdrawal.amount }
      );

      res.json({ message: "Withdrawal approved" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/withdrawals/:id/complete", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const withdrawal = await storage.getWithdrawalWithSeller(req.params.id);
      if (!withdrawal) {
        return res.status(404).json({ message: "Withdrawal not found" });
      }

      if (withdrawal.status !== "approved") {
        return res.status(400).json({ message: "Withdrawal must be approved first" });
      }

      // Deduct from seller's balance
      const seller = await storage.getUser(withdrawal.sellerId);
      if (seller) {
        const newBalance = (parseFloat(seller.walletBalance) - parseFloat(withdrawal.amount)).toFixed(2);
        await storage.updateUserBalance(withdrawal.sellerId, newBalance);

        // Create wallet transaction
        await storage.createWalletTransaction({
          userId: withdrawal.sellerId,
          type: "debit",
          amount: withdrawal.amount,
          reason: "Withdrawal completed",
        });
      }

      await storage.updateWithdrawalStatus(req.params.id, "completed");

      await storage.createAdminLog({
        adminId: (req.user as any).id,
        action: "withdrawal_completed",
        meta: { withdrawalId: req.params.id },
      });

      await sendNotification(
        withdrawal.sellerId,
        "withdrawal_update",
        "Rút tiền thành công",
        `Yêu cầu rút ${parseFloat(withdrawal.amount).toLocaleString("vi-VN")}đ đã hoàn tất. Tiền đã được chuyển vào tài khoản ngân hàng.`,
        "/seller",
        { withdrawalId: req.params.id, amount: withdrawal.amount }
      );

      res.json({ message: "Withdrawal completed" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/withdrawals/:id/reject", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const withdrawal = await storage.getWithdrawal(req.params.id);
      
      await storage.updateWithdrawalStatus(req.params.id, "rejected");

      await storage.createAdminLog({
        adminId: (req.user as any).id,
        action: "withdrawal_rejected",
        meta: { withdrawalId: req.params.id },
      });

      if (withdrawal) {
        await sendNotification(
          withdrawal.sellerId,
          "withdrawal_update",
          "Yêu cầu rút tiền bị từ chối",
          `Yêu cầu rút ${parseFloat(withdrawal.amount).toLocaleString("vi-VN")}đ đã bị từ chối. Vui lòng liên hệ admin để biết thêm chi tiết.`,
          "/seller",
          { withdrawalId: req.params.id, amount: withdrawal.amount }
        );
      }

      res.json({ message: "Withdrawal rejected" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== ADMIN REPORTS ==========
  app.get("/api/admin/reports/revenue", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const { period = "daily", year, month } = req.query;
      const yearNum = year ? parseInt(year as string) : undefined;
      const monthNum = month ? parseInt(month as string) : undefined;
      const reports = await storage.getRevenueReport(period as string, yearNum, monthNum);
      res.json(reports);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/reports/sellers", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const { year, month } = req.query;
      const yearNum = year ? parseInt(year as string) : undefined;
      const monthNum = month ? parseInt(month as string) : undefined;
      const sellerRevenue = await storage.getSellerRevenueReport(yearNum, monthNum);
      res.json(sellerRevenue);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin: Cleanup expired reservations and pending orders
  app.post("/api/admin/cleanup", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const releasedItems = await storage.cleanupExpiredReservations();
      const cancelledOrders = await storage.cancelExpiredPendingOrders();
      
      await storage.createAdminLog({
        adminId: (req.user as any).id,
        action: "system_cleanup",
        meta: { releasedItems, cancelledOrders },
      });

      res.json({ 
        message: "Cleanup completed",
        releasedItems,
        cancelledOrders
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== ADMIN SELLERS MANAGEMENT ==========
  app.get("/api/admin/sellers", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const sellers = await storage.getAllSellers();
      res.json(sellers);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/sellers/:id/lock", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      await storage.updateSellerLockStatus(req.params.id, true);
      
      await storage.createAdminLog({
        adminId: (req.user as any).id,
        action: "seller_locked",
        meta: { sellerId: req.params.id },
      });

      res.json({ message: "Seller locked" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/sellers/:id/unlock", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      await storage.updateSellerLockStatus(req.params.id, false);
      
      await storage.createAdminLog({
        adminId: (req.user as any).id,
        action: "seller_unlocked",
        meta: { sellerId: req.params.id },
      });

      res.json({ message: "Seller unlocked" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/sellers/:id/bonus", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const { amount, reason } = req.body;
      
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "Seller not found" });
      }

      const newBalance = (parseFloat(user.walletBalance) + parseFloat(amount)).toFixed(2);
      await storage.updateUserBalance(req.params.id, newBalance);

      await storage.createWalletTransaction({
        userId: req.params.id,
        type: "credit",
        amount,
        reason: reason || "Admin bonus",
      });
      
      await storage.createAdminLog({
        adminId: (req.session as any).userId,
        action: "seller_bonus_added",
        meta: { sellerId: req.params.id, amount, reason },
      });

      res.json({ message: "Bonus added" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== ADMIN USERS MANAGEMENT ==========
  app.get("/api/admin/users", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/users/:id", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const { firstName, lastName, email, phone, role, status, walletBalance, newPassword } = req.body;
      const updates: any = {};
      
      if (firstName !== undefined) updates.firstName = firstName;
      if (lastName !== undefined) updates.lastName = lastName;
      if (email !== undefined) updates.email = email;
      if (phone !== undefined) updates.phone = phone;
      if (role) updates.role = role;
      if (status) updates.status = status;
      if (walletBalance !== undefined) updates.walletBalance = walletBalance;
      
      if (newPassword && newPassword.length > 0) {
        const bcrypt = await import("bcryptjs");
        updates.password = await bcrypt.hash(newPassword, 10);
      }
      
      const user = await storage.updateUser(req.params.id, updates);
      
      await storage.createAdminLog({
        adminId: (req.session as any).userId,
        action: "user_updated",
        meta: { userId: req.params.id, updatedFields: Object.keys(updates) },
      });

      res.json(user);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/admin/users/:id", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const targetUser = await storage.getUser(req.params.id);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      if (targetUser.role === "admin") {
        return res.status(403).json({ message: "Cannot delete admin users" });
      }
      
      await storage.deleteUser(req.params.id);
      
      await storage.createAdminLog({
        adminId: (req.session as any).userId,
        action: "user_deleted",
        meta: { userId: req.params.id, email: targetUser.email },
      });

      res.json({ message: "User deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/users/:id/ban", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const user = await storage.updateUserStatus(req.params.id, "banned");
      
      await storage.createAdminLog({
        adminId: (req.session as any).userId,
        action: "user_banned",
        meta: { userId: req.params.id },
      });

      res.json(user);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/users/:id/unban", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const user = await storage.updateUserStatus(req.params.id, "active");
      
      await storage.createAdminLog({
        adminId: (req.session as any).userId,
        action: "user_unbanned",
        meta: { userId: req.params.id },
      });

      res.json(user);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== USER DEPOSITS ==========
  app.get("/api/deposits", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const deposits = await storage.getUserDeposits(userId);
      res.json(deposits);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/deposits", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId;
      const { amount, transactionCode } = req.body;
      
      if (!amount || parseFloat(amount) < 10000) {
        return res.status(400).json({ message: "Số tiền nạp tối thiểu là 10,000 VND" });
      }
      
      if (!transactionCode) {
        return res.status(400).json({ message: "Thiếu mã giao dịch" });
      }
      
      const deposit = await storage.createDeposit({
        userId,
        amount: amount.toString(),
        transactionCode,
        status: "pending",
      });
      
      res.json(deposit);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== ADMIN DEPOSITS MANAGEMENT ==========
  app.get("/api/admin/deposits/pending", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const deposits = await storage.getPendingDeposits();
      res.json(deposits);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/deposits/:id/approve", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const deposit = await storage.getDepositWithUser(req.params.id);
      if (!deposit) {
        return res.status(404).json({ message: "Deposit not found" });
      }

      await storage.updateDepositStatus(req.params.id, "approved");
      
      const newBalance = (parseFloat(deposit.user.walletBalance) + parseFloat(deposit.amount)).toFixed(2);
      await storage.updateUserBalance(deposit.userId, newBalance);

      await storage.createWalletTransaction({
        userId: deposit.userId,
        type: "credit",
        amount: deposit.amount,
        reason: `Nạp tiền - Mã GD: ${deposit.transactionCode}`,
      });
      
      await storage.createAdminLog({
        adminId: (req.session as any).userId,
        action: "deposit_approved",
        meta: { depositId: req.params.id, amount: deposit.amount, userId: deposit.userId },
      });

      await sendNotification(
        deposit.userId,
        "deposit_update",
        "Nạp tiền thành công",
        `Yêu cầu nạp ${parseFloat(deposit.amount).toLocaleString("vi-VN")}đ đã được phê duyệt. Số dư mới: ${parseFloat(newBalance).toLocaleString("vi-VN")}đ`,
        "/dashboard",
        { depositId: req.params.id, amount: deposit.amount }
      );

      res.json({ message: "Deposit approved and wallet credited" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/deposits/:id/reject", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const { reason } = req.body;
      const deposit = await storage.getDepositWithUser(req.params.id);
      
      await storage.updateDepositStatus(req.params.id, "rejected", reason);
      
      await storage.createAdminLog({
        adminId: (req.session as any).userId,
        action: "deposit_rejected",
        meta: { depositId: req.params.id, reason },
      });

      if (deposit) {
        await sendNotification(
          deposit.userId,
          "deposit_update",
          "Yêu cầu nạp tiền bị từ chối",
          reason || `Yêu cầu nạp ${parseFloat(deposit.amount).toLocaleString("vi-VN")}đ đã bị từ chối.`,
          "/deposit",
          { depositId: req.params.id }
        );
      }

      res.json({ message: "Deposit rejected" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== ADMIN REVIEWS MANAGEMENT ==========
  app.get("/api/admin/reviews", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const reviews = await storage.getAllReviews();
      res.json(reviews);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/reviews/:id/hide", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      await storage.updateReviewVisibility(req.params.id, false);
      
      await storage.createAdminLog({
        adminId: (req.session as any).userId,
        action: "review_hidden",
        meta: { reviewId: req.params.id },
      });

      res.json({ message: "Review hidden" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/reviews/:id/show", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      await storage.updateReviewVisibility(req.params.id, true);
      
      await storage.createAdminLog({
        adminId: (req.session as any).userId,
        action: "review_shown",
        meta: { reviewId: req.params.id },
      });

      res.json({ message: "Review shown" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== DEPOSITS (User) ==========
  app.post("/api/deposits", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const { amount, transactionCode, proofImageUrl } = req.body;
      
      const deposit = await storage.createDeposit({
        userId,
        amount,
        transactionCode,
        proofImageUrl: proofImageUrl || null,
        status: "pending",
      });

      res.json(deposit);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/deposits", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const deposits = await storage.getUserDeposits(userId);
      res.json(deposits);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== CONVERSATIONS & MESSAGES ==========
  app.get("/api/conversations", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const conversations = await storage.getUserConversations(userId);
      res.json(conversations);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/conversations/:id/messages", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const conversation = await storage.getConversation(req.params.id);
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      if (conversation.participant1Id !== userId && conversation.participant2Id !== userId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      await storage.markMessagesAsRead(req.params.id, userId);
      const messages = await storage.getConversationMessages(req.params.id);
      res.json(messages);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/conversations/:id/messages", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const { content, type = "text", fileUrl } = req.body;
      
      const conversation = await storage.getConversation(req.params.id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      if (conversation.participant1Id !== userId && conversation.participant2Id !== userId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const message = await storage.createMessage({
        conversationId: req.params.id,
        senderId: userId,
        content,
        type,
        fileUrl,
      });

      const sender = await storage.getUser(userId);
      const recipientId = conversation.participant1Id === userId 
        ? conversation.participant2Id 
        : conversation.participant1Id;
      
      const truncatedContent = content.length > 50 ? content.substring(0, 50) + "..." : content;
      
      await sendNotification(
        recipientId,
        "new_message",
        `Tin nhắn mới từ ${sender?.firstName || "Người dùng"}`,
        type === "text" ? truncatedContent : "Đã gửi một tệp đính kèm",
        "/chat",
        { conversationId: req.params.id }
      );

      res.json(message);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Chat file upload endpoint
  const chatUpload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const chatDir = path.join(uploadDir, "chat");
        if (!fs.existsSync(chatDir)) {
          fs.mkdirSync(chatDir, { recursive: true });
        }
        cb(null, chatDir);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
        cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
      },
    }),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit for chat files
    },
    fileFilter: (req, file, cb) => {
      const allowedMimes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
        'image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence',
        'text/plain', 'application/zip', 'application/x-zip-compressed',
        'application/octet-stream'
      ];
      const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.heic', '.heif', '.txt', '.zip'];
      const ext = path.extname(file.originalname).toLowerCase();
      
      // Allow if either MIME or extension matches
      if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error('Chỉ hỗ trợ file ảnh (JPG, PNG, GIF, WebP, SVG, HEIC), .txt và .zip'));
      }
    }
  });

  app.post("/api/upload/chat", isAuthenticated, chatUpload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      const fileUrl = `/uploads/chat/${req.file.filename}`;
      res.json({ url: fileUrl, filename: req.file.originalname });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/conversations/admin", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      
      const adminUser = await storage.getUserByEmail("admin@taphoavietmax.vn");
      if (!adminUser) {
        return res.status(404).json({ message: "Admin not available" });
      }

      const conversation = await storage.getOrCreateAdminConversation(userId, adminUser.id);
      res.json(conversation);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/conversations/seller/:sellerId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const { sellerId } = req.params;
      const { orderId, subject } = req.body;

      const existingConversations = await storage.getUserConversations(userId);
      const existing = existingConversations.find(c => 
        (c.participant1Id === userId && c.participant2Id === sellerId) ||
        (c.participant1Id === sellerId && c.participant2Id === userId)
      );

      if (existing && !orderId) {
        return res.json(existing);
      }

      const conversation = await storage.createConversation({
        type: orderId ? "order_dispute" : "seller_buyer",
        participant1Id: userId,
        participant2Id: sellerId,
        orderId: orderId || null,
        subject: subject || null,
      });

      res.json(conversation);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/messages/unread-count", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const count = await storage.getUnreadMessageCount(userId);
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== REVIEWS (User) ==========
  app.post("/api/reviews", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const { orderId, rating, comment } = req.body;
      
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      if (order.buyerId !== userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      
      if (order.status !== "paid") {
        return res.status(400).json({ message: "Can only review paid orders" });
      }

      const existingReview = await storage.getOrderReview(orderId);
      if (existingReview) {
        return res.status(400).json({ message: "Already reviewed" });
      }

      const review = await storage.createReview({
        orderId,
        buyerId: userId,
        sellerId: order.sellerId,
        rating,
        comment: comment || null,
      });

      res.json(review);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/sellers/:sellerId/reviews", async (req: Request, res: Response) => {
    try {
      const reviews = await storage.getSellerReviews(req.params.sellerId);
      res.json(reviews);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== ADMIN LOGIN (Special Admin Account) ==========
  app.post("/api/admin/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      
      const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "animodadmin";
      const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "bssoacemtu1";
      
      if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
        return res.status(401).json({ message: "Tên đăng nhập hoặc mật khẩu không đúng" });
      }
      
      let adminUser = await storage.getUserByEmail("admin@taphoavietmax.vn");
      
      if (!adminUser) {
        const bcrypt = await import("bcryptjs");
        const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
        adminUser = await storage.createUser({
          email: "admin@taphoavietmax.vn",
          password: hashedPassword,
          firstName: "Admin",
          lastName: "System",
        });
        await storage.updateUserRole(adminUser.id, "admin");
        adminUser = await storage.getUser(adminUser.id);
      }
      
      if (adminUser && adminUser.role !== "admin") {
        await storage.updateUserRole(adminUser.id, "admin");
        adminUser = await storage.getUser(adminUser.id);
      }
      
      (req.session as any).userId = adminUser!.id;
      
      res.json({ message: "Đăng nhập admin thành công", user: adminUser });
    } catch (error: any) {
      console.error("Admin login error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ========== ADMIN SETUP ==========
  app.post("/api/make-first-admin", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const adminExists = await storage.checkAdminExists();
      if (adminExists) {
        return res.status(403).json({ message: "Admin already exists. You cannot become admin." });
      }

      await storage.updateUserRole(userId, "admin");
      res.json({ message: "You are now admin! Refresh page to see admin dashboard." });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== SYSTEM SETTINGS ==========
  // Public endpoint for bank settings (for QR payment display)
  app.get("/api/public/bank-settings", async (req: Request, res: Response) => {
    try {
      const settings = await storage.getAllSystemSettings();
      res.json({
        bankName: settings.bank_name || "Vietcombank",
        accountNumber: settings.account_number || "9878808855",
        accountHolder: settings.account_holder || "LUONG THI LIEN",
        bankCode: (settings.bank_name || "Vietcombank").toLowerCase().replace(/\s+/g, ''),
      });
    } catch (error: any) {
      // Return defaults on error
      res.json({
        bankName: "Vietcombank",
        accountNumber: "9878808855",
        accountHolder: "LUONG THI LIEN",
        bankCode: "vietcombank",
      });
    }
  });

  app.get("/api/admin/settings", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const settings = await storage.getAllSystemSettings();
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/settings/:key", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const { value, description } = req.body;
      await storage.updateSystemSetting(req.params.key, value, description);
      res.json({ message: "Settings updated" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== NOTIFICATIONS ==========
  // Get user notification settings
  app.get("/api/notifications/settings", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const settings = await storage.getOrCreateNotificationSettings(userId);
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Update user notification settings
  app.patch("/api/notifications/settings", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      
      // First ensure settings exist
      await storage.getOrCreateNotificationSettings(userId);
      
      // Then update with the new values
      const settings = await storage.updateNotificationSettings(userId, req.body);
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get user notifications
  app.get("/api/notifications", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const notifications = await storage.getUserNotifications(userId);
      res.json(notifications);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get unread notifications count
  app.get("/api/notifications/unread-count", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const count = await storage.getUnreadNotificationsCount(userId);
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Mark a notification as read
  app.patch("/api/notifications/:id/read", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const notification = await storage.markNotificationAsRead(req.params.id);
      res.json(notification);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Mark all notifications as read
  app.post("/api/notifications/read-all", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      await storage.markAllNotificationsAsRead(userId);
      res.json({ message: "All notifications marked as read" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Delete a notification
  app.delete("/api/notifications/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      await storage.deleteNotification(req.params.id);
      res.json({ message: "Notification deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Clear all notifications
  app.delete("/api/notifications", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      await storage.clearAllNotifications(userId);
      res.json({ message: "All notifications cleared" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== REFERRAL SYSTEM ==========
  // Get user's referral code
  app.get("/api/referral/code", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      let referralCode = await storage.getUserReferralCode(userId);
      
      if (!referralCode) {
        const code = crypto.randomBytes(4).toString("hex").toUpperCase();
        referralCode = await storage.createUserReferralCode({ userId, code });
      }
      
      res.json(referralCode);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get user's referrals
  app.get("/api/referral/list", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const referrals = await storage.getUserReferrals(userId);
      res.json(referrals);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Apply referral code during registration (handled in customAuth)
  app.post("/api/referral/apply", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const { code } = req.body;
      
      const referralCode = await storage.getReferralByCode(code);
      if (!referralCode) {
        return res.status(404).json({ message: "Mã giới thiệu không tồn tại" });
      }
      
      if (referralCode.userId === userId) {
        return res.status(400).json({ message: "Không thể sử dụng mã giới thiệu của chính mình" });
      }
      
      await storage.createReferral({
        referrerId: referralCode.userId,
        referredId: userId,
        referralCode: code,
      });
      
      res.json({ message: "Đã áp dụng mã giới thiệu thành công" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== FLASH SALES ==========
  // Get active flash sales (public)
  app.get("/api/flash-sales/active", async (req: Request, res: Response) => {
    try {
      const sales = await storage.getActiveFlashSales();
      const salesWithProducts = await Promise.all(
        sales.map(async (sale) => {
          const products = await storage.getFlashSaleProducts(sale.id);
          return { ...sale, products };
        })
      );
      res.json(salesWithProducts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin: Get all flash sales
  app.get("/api/admin/flash-sales", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const sales = await storage.getAllFlashSales();
      res.json(sales);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin: Create flash sale
  app.post("/api/admin/flash-sales", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const sale = await storage.createFlashSale(req.body);
      res.json(sale);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin: Update flash sale
  app.patch("/api/admin/flash-sales/:id", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const sale = await storage.updateFlashSale(req.params.id, req.body);
      res.json(sale);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin: Delete flash sale
  app.delete("/api/admin/flash-sales/:id", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      await storage.deleteFlashSale(req.params.id);
      res.json({ message: "Đã xóa flash sale" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin: Add product to flash sale
  app.post("/api/admin/flash-sales/:id/products", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const product = await storage.addFlashSaleProduct({
        flashSaleId: req.params.id,
        ...req.body,
      });
      res.json(product);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin: Get flash sale products
  app.get("/api/admin/flash-sales/:id/products", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const products = await storage.getFlashSaleProducts(req.params.id);
      res.json(products);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin: Remove product from flash sale
  app.delete("/api/admin/flash-sale-products/:id", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      await storage.removeFlashSaleProduct(req.params.id);
      res.json({ message: "Đã xóa sản phẩm khỏi flash sale" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== WISHLIST ==========
  // Get user's wishlist
  app.get("/api/wishlist", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const wishlist = await storage.getUserWishlist(userId);
      res.json(wishlist);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Add to wishlist
  app.post("/api/wishlist", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const { productId, priceAtAdd } = req.body;
      
      const existing = await storage.isInWishlist(userId, productId);
      if (existing) {
        return res.status(400).json({ message: "Sản phẩm đã có trong danh sách yêu thích" });
      }
      
      const wishlist = await storage.addToWishlist({ userId, productId, priceAtAdd });
      res.json(wishlist);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Check if product is in wishlist
  app.get("/api/wishlist/check/:productId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const inWishlist = await storage.isInWishlist(userId, req.params.productId);
      res.json({ inWishlist });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Remove from wishlist
  app.delete("/api/wishlist/:productId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      await storage.removeFromWishlist(userId, req.params.productId);
      res.json({ message: "Đã xóa khỏi danh sách yêu thích" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== BUNDLES ==========
  // Get all active bundles (public)
  app.get("/api/bundles", async (req: Request, res: Response) => {
    try {
      const bundlesData = await storage.getAllBundles();
      const bundlesWithItems = await Promise.all(
        bundlesData.map(async (bundle) => {
          const withItems = await storage.getBundleWithItems(bundle.id);
          return { ...bundle, items: withItems?.items || [] };
        })
      );
      res.json(bundlesWithItems);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get bundle details
  app.get("/api/bundles/:id", async (req: Request, res: Response) => {
    try {
      const bundle = await storage.getBundleWithItems(req.params.id);
      if (!bundle) {
        return res.status(404).json({ message: "Bundle không tồn tại" });
      }
      res.json(bundle);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Seller: Get my bundles
  app.get("/api/seller/bundles", isAuthenticated, requireRole(["seller"]), async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const bundlesData = await storage.getSellerBundles(userId);
      const bundlesWithItems = await Promise.all(
        bundlesData.map(async (bundle) => {
          const withItems = await storage.getBundleWithItems(bundle.id);
          return { ...bundle, items: withItems?.items || [] };
        })
      );
      res.json(bundlesWithItems);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Seller: Create bundle
  app.post("/api/seller/bundles", isAuthenticated, requireRole(["seller"]), async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const bundle = await storage.createBundle({ ...req.body, sellerId: userId });
      res.json(bundle);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Seller: Update bundle
  app.patch("/api/seller/bundles/:id", isAuthenticated, requireRole(["seller"]), async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const bundle = await storage.getBundle(req.params.id);
      if (!bundle || bundle.sellerId !== userId) {
        return res.status(403).json({ message: "Không có quyền chỉnh sửa bundle này" });
      }
      const updated = await storage.updateBundle(req.params.id, req.body);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Seller: Delete bundle
  app.delete("/api/seller/bundles/:id", isAuthenticated, requireRole(["seller"]), async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const bundle = await storage.getBundle(req.params.id);
      if (!bundle || bundle.sellerId !== userId) {
        return res.status(403).json({ message: "Không có quyền xóa bundle này" });
      }
      await storage.deleteBundle(req.params.id);
      res.json({ message: "Đã xóa bundle" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Seller: Add item to bundle
  app.post("/api/seller/bundles/:id/items", isAuthenticated, requireRole(["seller"]), async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const bundle = await storage.getBundle(req.params.id);
      if (!bundle || bundle.sellerId !== userId) {
        return res.status(403).json({ message: "Không có quyền thêm sản phẩm vào bundle này" });
      }
      const item = await storage.addBundleItem({ bundleId: req.params.id, ...req.body });
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Seller: Remove item from bundle
  app.delete("/api/seller/bundle-items/:id", isAuthenticated, requireRole(["seller"]), async (req: Request, res: Response) => {
    try {
      await storage.removeBundleItem(req.params.id);
      res.json({ message: "Đã xóa sản phẩm khỏi bundle" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== TELEGRAM INTEGRATION ==========
  // Get telegram settings
  app.get("/api/telegram/settings", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const settings = await storage.getTelegramSettings(userId);
      res.json(settings || { isVerified: false });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Generate verification code
  app.post("/api/telegram/generate-code", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const verificationCode = crypto.randomBytes(3).toString("hex").toUpperCase();
      
      let settings = await storage.getTelegramSettings(userId);
      if (settings) {
        settings = await storage.updateTelegramSettings(userId, { verificationCode });
      } else {
        settings = await storage.createTelegramSettings({ userId, verificationCode });
      }
      
      res.json({ verificationCode });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Update telegram settings
  app.patch("/api/telegram/settings", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const settings = await storage.updateTelegramSettings(userId, req.body);
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== WARRANTIES ==========
  // Get user's warranties
  app.get("/api/warranties", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const warranties = await storage.getUserWarranties(userId);
      res.json(warranties);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get warranty by order
  app.get("/api/warranties/order/:orderId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const warranty = await storage.getOrderWarranty(req.params.orderId);
      res.json(warranty || null);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Create warranty claim
  app.post("/api/warranty-claims", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const { warrantyId, reason, evidence } = req.body;
      
      const warranty = await storage.getWarranty(warrantyId);
      if (!warranty || warranty.buyerId !== userId) {
        return res.status(403).json({ message: "Không có quyền yêu cầu bảo hành này" });
      }
      
      if (warranty.status !== "active") {
        return res.status(400).json({ message: "Bảo hành không còn hiệu lực" });
      }
      
      const claim = await storage.createWarrantyClaim({ warrantyId, buyerId: userId, reason, evidence });
      await storage.updateWarrantyStatus(warrantyId, "claimed");
      
      await sendNotification(
        warranty.sellerId,
        "system",
        "Yêu cầu bảo hành mới",
        `Có yêu cầu bảo hành mới cho đơn hàng`,
        "/seller"
      );
      
      res.json(claim);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Seller: Get warranty claims for my products
  app.get("/api/seller/warranty-claims", isAuthenticated, requireRole(["seller"]), async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const warranties = await storage.getSellerWarranties(userId);
      res.json(warranties);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin: Get pending warranty claims
  app.get("/api/admin/warranty-claims", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const claims = await storage.getPendingWarrantyClaims();
      res.json(claims);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin: Update warranty claim status
  app.patch("/api/admin/warranty-claims/:id", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const { status, resolution } = req.body;
      const claim = await storage.updateWarrantyClaimStatus(req.params.id, status, resolution);
      
      const claimDetails = await storage.getWarrantyClaimWithDetails(req.params.id);
      if (claimDetails) {
        await sendNotification(
          claimDetails.buyerId,
          "system",
          `Yêu cầu bảo hành đã được ${status === "approved" ? "chấp nhận" : status === "rejected" ? "từ chối" : "xử lý"}`,
          resolution || `Trạng thái: ${status}`,
          "/dashboard"
        );
      }
      
      res.json(claim);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== DISPUTES ==========
  // Create dispute
  app.post("/api/disputes", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const { orderId, reason, buyerEvidence } = req.body;
      
      const order = await storage.getOrderWithDetails(orderId);
      if (!order || order.buyerId !== userId) {
        return res.status(403).json({ message: "Không có quyền tạo khiếu nại cho đơn hàng này" });
      }
      
      const existingDispute = await storage.getOrderDispute(orderId);
      if (existingDispute) {
        return res.status(400).json({ message: "Đã có khiếu nại cho đơn hàng này" });
      }
      
      const dispute = await storage.createDispute({
        orderId,
        buyerId: userId,
        sellerId: order.sellerId,
        reason,
        buyerEvidence,
      });
      
      await sendNotification(
        order.sellerId,
        "system",
        "Khiếu nại mới",
        `Có khiếu nại mới cho đơn hàng #${order.orderCode}`,
        "/seller"
      );
      
      res.json(dispute);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get dispute for order
  app.get("/api/disputes/order/:orderId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const dispute = await storage.getOrderDispute(req.params.orderId);
      res.json(dispute || null);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Seller: Respond to dispute
  app.patch("/api/disputes/:id/respond", isAuthenticated, requireRole(["seller"]), async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const { sellerResponse, sellerEvidence } = req.body;
      
      const dispute = await storage.getDispute(req.params.id);
      if (!dispute || dispute.sellerId !== userId) {
        return res.status(403).json({ message: "Không có quyền phản hồi khiếu nại này" });
      }
      
      const updated = await storage.updateDispute(req.params.id, { sellerResponse, sellerEvidence });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin: Get all disputes
  app.get("/api/admin/disputes", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const disputes = await storage.getAllDisputes();
      res.json(disputes);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin: Update dispute status
  app.patch("/api/admin/disputes/:id", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const { status, resolution, refundAmount, adminNote } = req.body;
      
      const dispute = await storage.getDisputeWithDetails(req.params.id);
      if (!dispute) {
        return res.status(404).json({ message: "Khiếu nại không tồn tại" });
      }
      
      await storage.updateDispute(req.params.id, { adminNote, refundAmount });
      const updated = await storage.updateDisputeStatus(req.params.id, status, resolution);
      
      if (status === "resolved_buyer" && refundAmount) {
        const buyer = await storage.getUser(dispute.buyerId);
        if (buyer) {
          const newBalance = (parseFloat(buyer.walletBalance) + parseFloat(refundAmount)).toFixed(2);
          await storage.updateUserBalance(dispute.buyerId, newBalance);
          await storage.createWalletTransaction({
            userId: dispute.buyerId,
            type: "credit",
            amount: refundAmount,
            reason: `Hoàn tiền khiếu nại đơn hàng #${dispute.order.orderCode}`,
          });
        }
      }
      
      await sendNotification(
        dispute.buyerId,
        "system",
        `Khiếu nại đã được ${status.startsWith("resolved") ? "giải quyết" : "cập nhật"}`,
        resolution || `Trạng thái: ${status}`,
        "/dashboard"
      );
      
      await sendNotification(
        dispute.sellerId,
        "system",
        `Khiếu nại đã được ${status.startsWith("resolved") ? "giải quyết" : "cập nhật"}`,
        resolution || `Trạng thái: ${status}`,
        "/seller"
      );
      
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== SELLER ANALYTICS ==========
  app.get("/api/seller/analytics", isAuthenticated, requireRole(["seller"]), async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const analytics = await storage.getSellerAnalytics(userId);
      res.json(analytics);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== PRICING SUGGESTIONS ==========
  app.get("/api/pricing-suggestion/:platform", isAuthenticated, requireRole(["seller"]), async (req: Request, res: Response) => {
    try {
      const suggestion = await storage.getPricingSuggestionsForPlatform(req.params.platform);
      res.json(suggestion);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== ADMIN POST ORDERS (Legacy) ==========
  app.post("/api/admin/post-order", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const { kioskToken, quantity, userToken: providedUserToken } = req.body;
      if (!kioskToken || !quantity) {
        return res.status(400).json({ message: "Thiếu kioskToken hoặc quantity" });
      }

      // Use provided userToken or get from environment variable
      const userToken = providedUserToken || process.env.API_USER_TOKEN;
      if (!userToken) {
        return res.status(400).json({ message: "Thiếu userToken" });
      }

      // Call external API to buy products
      const buyUrl = `https://taphoammo.net/api/buyProducts?kioskToken=${encodeURIComponent(kioskToken)}&userToken=${encodeURIComponent(userToken)}&quantity=${quantity}`;
      const buyResponse = await fetch(buyUrl);
      const buyData = await buyResponse.json();

      if (!buyData.success) {
        return res.status(400).json({ message: buyData.description || "Mua hàng thất bại" });
      }

      // Get products using order_id
      const getUrl = `https://taphoammo.net/api/getProducts?orderId=${buyData.order_id}&userToken=${encodeURIComponent(userToken)}`;
      const getResponse = await fetch(getUrl);
      const getData = await getResponse.json();

      res.json({
        success: true,
        order_id: buyData.order_id,
        products: getData.data || [],
        message: "Đơn hàng tạo thành công"
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== USER ACTIVITY (Online Status) ==========
  app.post("/api/heartbeat", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      await storage.updateUserLastSeen(userId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/users/active", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const activeUsers = await storage.getActiveUsers();
      res.json(activeUsers.map(u => ({ id: u.id, lastSeenAt: u.lastSeenAt })));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== PENDING EARNINGS ==========
  app.get("/api/admin/pending-earnings", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const earnings = await storage.getAllPendingEarnings();
      // Add seller and order info
      const enrichedEarnings = await Promise.all(
        earnings.map(async (earning) => {
          const seller = await storage.getUser(earning.sellerId);
          const order = await storage.getOrderWithDetails(earning.orderId);
          return {
            ...earning,
            seller: seller ? { id: seller.id, firstName: seller.firstName, lastName: seller.lastName, email: seller.email } : null,
            order: order ? { id: order.id, orderCode: order.orderCode, productTitle: order.product?.title } : null,
          };
        })
      );
      res.json(enrichedEarnings);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/pending-earnings/:id/release", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const { adminNote } = req.body;
      const earning = await storage.getPendingEarningById(req.params.id);
      if (!earning || earning.status !== "pending") {
        return res.status(404).json({ message: "Pending earning not found or already processed" });
      }
      
      // Release the earning
      const released = await storage.releasePendingEarning(req.params.id, adminNote);
      
      // Credit seller's wallet
      const seller = await storage.getUser(released.sellerId);
      if (seller) {
        const newBalance = (parseFloat(seller.walletBalance) + parseFloat(released.amount)).toFixed(2);
        await storage.updateUserBalance(released.sellerId, newBalance);
        
        await storage.createWalletTransaction({
          userId: released.sellerId,
          type: "credit",
          amount: released.amount,
          reason: `Tiền bán hàng đã được chuyển`,
          relatedOrderId: released.orderId,
        });
        
        await sendNotification(
          released.sellerId,
          "system",
          "Tiền đã được chuyển vào ví",
          `Số tiền ${parseFloat(released.amount).toLocaleString('vi-VN')}đ đã được chuyển vào ví của bạn.`,
          "/seller"
        );
      }
      
      await storage.createAdminLog({
        adminId: (req.user as any).id,
        action: "pending_earning_released",
        meta: { earningId: req.params.id, amount: released.amount },
      });
      
      res.json({ message: "Đã chuyển tiền thành công", earning: released });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/pending-earnings/:id/cancel", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const { adminNote } = req.body;
      const earning = await storage.getPendingEarningById(req.params.id);
      if (!earning || earning.status !== "pending") {
        return res.status(404).json({ message: "Pending earning not found or already processed" });
      }
      
      const cancelled = await storage.cancelPendingEarning(req.params.id, adminNote);
      
      await storage.createAdminLog({
        adminId: (req.user as any).id,
        action: "pending_earning_cancelled",
        meta: { earningId: req.params.id, amount: cancelled.amount, reason: adminNote },
      });
      
      res.json({ message: "Đã hủy khoản thanh toán", earning: cancelled });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Seller pending earnings endpoint
  app.get("/api/seller/pending-earnings", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const earnings = await storage.getPendingEarningsBySellerld(userId);
      const pendingBalance = await storage.getSellerPendingBalance(userId);
      res.json({ earnings, pendingBalance });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== ADMIN BROADCASTS ==========
  app.get("/api/broadcasts", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const broadcasts = await storage.getActiveAdminBroadcasts();
      res.json(broadcasts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/broadcasts", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const broadcasts = await storage.getAllAdminBroadcasts();
      res.json(broadcasts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/broadcasts", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const { title, message, type, expiresAt } = req.body;
      
      if (!title || !message) {
        return res.status(400).json({ message: "Thiếu tiêu đề hoặc nội dung" });
      }
      
      const broadcast = await storage.createAdminBroadcast({
        adminId: userId,
        title,
        message,
        type: type || "info",
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      });
      
      // Send notification to all users about the broadcast
      const allUsers = await db.select().from(users).where(eq(users.status, "active"));
      for (const user of allUsers) {
        await sendNotification(
          user.id,
          "system",
          title,
          message,
          "/"
        );
      }
      
      res.json(broadcast);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/broadcasts/:id", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const broadcast = await storage.updateAdminBroadcast(req.params.id, req.body);
      res.json(broadcast);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/admin/broadcasts/:id", isAuthenticated, requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      await storage.deleteAdminBroadcast(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== CONVERSATION UNREAD COUNTS ==========
  app.get("/api/conversations/:id/unread-count", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const count = await storage.getConversationUnreadCount(req.params.id, userId);
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== AUTO-RELEASE PENDING EARNINGS JOB ==========
  // Check and release pending earnings every 5 minutes
  const releasePendingEarnings = async () => {
    try {
      const releasableEarnings = await storage.getReleasablePendingEarnings();
      for (const earning of releasableEarnings) {
        try {
          // Release the earning
          const released = await storage.releasePendingEarning(earning.id, "Tự động chuyển sau 3 ngày");
          
          // Credit seller's wallet
          const seller = await storage.getUser(released.sellerId);
          if (seller) {
            const newBalance = (parseFloat(seller.walletBalance) + parseFloat(released.amount)).toFixed(2);
            await storage.updateUserBalance(released.sellerId, newBalance);
            
            await storage.createWalletTransaction({
              userId: released.sellerId,
              type: "credit",
              amount: released.amount,
              reason: `Tiền bán hàng đã được chuyển (tự động)`,
              relatedOrderId: released.orderId,
            });
            
            await sendNotification(
              released.sellerId,
              "system",
              "Tiền đã được chuyển vào ví",
              `Số tiền ${parseFloat(released.amount).toLocaleString('vi-VN')}đ đã được tự động chuyển vào ví của bạn sau 3 ngày.`,
              "/seller"
            );
          }
          console.log(`Auto-released pending earning ${earning.id} for seller ${earning.sellerId}`);
        } catch (err) {
          console.error(`Failed to release pending earning ${earning.id}:`, err);
        }
      }
    } catch (err) {
      console.error("Failed to check releasable pending earnings:", err);
    }
  };
  
  // Run every 5 minutes
  setInterval(releasePendingEarnings, 5 * 60 * 1000);
  // Also run once at startup
  setTimeout(releasePendingEarnings, 10000);

  return httpServer;
}
