import type { Express, RequestHandler } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import bcrypt from "bcryptjs";
import { storage } from "./storage";

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
}

export async function setupCustomAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  // Register endpoint
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, firstName, lastName, referralCode } = req.body;

      if (!email || !password || !firstName) {
        return res.status(400).json({ message: "Email, mật khẩu và tên là bắt buộc" });
      }

      if (password.length < 6) {
        return res.status(400).json({ message: "Mật khẩu phải có ít nhất 6 ký tự" });
      }

      // Check if email already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Email đã được sử dụng" });
      }

      // Validate referral code if provided
      let referrerCode = null;
      if (referralCode) {
        referrerCode = await storage.getReferralByCode(referralCode);
        if (!referrerCode) {
          console.log("Invalid referral code:", referralCode);
        }
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const user = await storage.createUser({
        email,
        password: hashedPassword,
        firstName,
        lastName: lastName || null,
      });

      // Create referral record if valid referral code was provided
      if (referrerCode && referrerCode.userId !== user.id) {
        try {
          // Create referral record linking referrer to this new user
          await storage.createReferral({
            referrerId: referrerCode.userId,
            referredId: user.id,
            referralCode: referralCode,
          });
          
          // Increment referrer's totalReferrals count only (earnings will be updated when user makes purchase)
          await storage.incrementReferralCount(referrerCode.userId);
          
          console.log(`Referral created: ${referrerCode.userId} -> ${user.id}`);
        } catch (refError) {
          console.error("Error creating referral:", refError);
        }
      }

      // Set session
      (req.session as any).userId = user.id;
      (req.session as any).userRole = user.role;

      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      });
    } catch (error: any) {
      console.error("Register error:", error);
      res.status(500).json({ message: "Lỗi đăng ký: " + error.message });
    }
  });

  // Login endpoint
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email và mật khẩu là bắt buộc" });
      }

      // Find user by email
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Email hoặc mật khẩu không đúng" });
      }

      // Check password
      if (!user.password) {
        return res.status(401).json({ message: "Tài khoản không có mật khẩu. Vui lòng liên hệ hỗ trợ." });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Email hoặc mật khẩu không đúng" });
      }

      // Check if user is banned
      if (user.status === "banned") {
        return res.status(403).json({ message: "Tài khoản của bạn đã bị khóa" });
      }

      // Set session
      (req.session as any).userId = user.id;
      (req.session as any).userRole = user.role;

      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      });
    } catch (error: any) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Lỗi đăng nhập: " + error.message });
    }
  });

  // Logout endpoint
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Lỗi đăng xuất" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Đăng xuất thành công" });
    });
  });
}

// Middleware to check if user is authenticated
export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const userId = (req.session as any)?.userId;

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Attach user info to request
  const user = await storage.getUser(userId);
  if (!user) {
    return res.status(401).json({ message: "User not found" });
  }

  (req as any).user = {
    id: user.id,
    role: user.role,
  };

  next();
};

// Role-based access control middleware
export const requireRole = (roles: Array<"buyer" | "seller" | "admin">): RequestHandler => {
  return async (req, res, next) => {
    const userId = (req.session as any)?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Fetch user from database to get current role
    const dbUser = await storage.getUser(userId);
    if (!dbUser) {
      return res.status(401).json({ message: "User not found" });
    }

    if (!roles.includes(dbUser.role as any)) {
      return res.status(403).json({ message: "Forbidden: insufficient permissions" });
    }

    (req as any).user = {
      id: dbUser.id,
      role: dbUser.role,
    };

    return next();
  };
};
