# Tạp Hóa Việt Max - Marketplace Platform

## Overview
Tạp Hóa Việt Max is a comprehensive marketplace platform for selling social media accounts (Facebook, Gmail, Zalo, TikTok, etc.) and software. The platform supports three user roles: Buyers, Sellers, and Admins.

## Tech Stack
- **Frontend**: React + TypeScript + Vite
- **Backend**: Express.js
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Custom email/password auth (bcrypt + session)
- **Styling**: Tailwind CSS + shadcn/ui
- **State Management**: TanStack Query

## Project Structure
```
├── client/                    # React frontend
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   ├── pages/             # Page components
│   │   ├── hooks/             # Custom hooks
│   │   └── lib/               # Utilities
├── server/                    # Express backend
│   ├── routes.ts              # API routes
│   ├── storage.ts             # Database operations
│   ├── customAuth.ts          # Custom email/password authentication
│   └── db.ts                  # Database connection
├── shared/                    # Shared code
│   └── schema.ts              # Drizzle schema & types
└── uploads/                   # File uploads directory
```

## Key Features
1. **Product Management**: Account listings with CSV import, software downloads
2. **QR Payment**: VietQR integration for bank transfers (Account holder: LUONG THI LIEN)
3. **KYC Verification**: ID upload and selfie verification for sellers
4. **Wallet System**: Internal balance with withdrawal requests (5% commission)
5. **Admin Dashboard**: KYC review, order/product approval, statistics
6. **Chat System**: Buyer-seller-admin messaging with order disputes
7. **Shop Reviews**: Buyers can rate sellers after orders
8. **Referral System**: User referral codes with commission tracking
9. **Flash Sales**: Time-limited discounts with countdown
10. **Wishlist**: Save products and get price drop notifications
11. **Seller Analytics**: Revenue charts and top product insights
12. **Product Bundles**: Bundle multiple products with discounts
13. **Auto Pricing**: Market-based price suggestions
14. **Telegram Notifications**: Order alerts via Telegram bot
15. **Product Warranty**: Warranty tracking and claim management
16. **Dispute Management**: Buyer-seller dispute resolution system

## User Roles
- **Buyer**: Browse products, purchase via QR, view order history, deposit money, chat with sellers/admin
- **Seller**: Register with KYC, list products, manage inventory, withdraw funds, respond to buyer chats
- **Admin**: Approve KYC/products/orders/withdrawals/deposits, view reports, manage sellers/users, moderate reviews

## Recent Changes (Dec 7, 2025)
- **Product Thumbnails Stored in Database**:
  - Thumbnails now stored as Base64 in PostgreSQL `thumbnail_data` column
  - Images persist across deployments (no more lost images after publish)
  - New API endpoint `/api/products/:id/thumbnail` serves images from database
  - Admin thumbnail upload uses memoryStorage (no filesystem dependency)
  - Migration script `scripts/migrate-thumbnails.ts` converts existing images
  - All 29 existing product thumbnails migrated successfully

## Recent Changes (Dec 6, 2025)
- **Software Products Unlimited Stock**:
  - Software products (file zip) can now be purchased unlimited times
  - No stock check for software - always available
  - Stock not decreased after software purchase
  - Frontend displays "Không giới hạn" instead of stock number for software
  - Quantity selector only shows for account products (not software)

- **Revenue Report Date Filtering**:
  - Admin Dashboard Reports tab now has year and month selectors
  - Default shows all-year data, can filter by specific month
  - Both revenue report and seller revenue report support filtering

- **Referral System Fully Implemented**:
  - Registration captures referral code from URL (?ref=XXX parameter)
  - New users get linked to their referrer when registering via referral link
  - 5% referral commission automatically calculated when referred user's order is confirmed
  - Commission is credited to referrer's wallet using SQL arithmetic for type safety
  - Referral stats tracked: totalReferrals, totalEarnings in userReferralCodes table
  - Wallet transactions created for each referral commission payment
  - Notification sent to referrer when they earn commission
  - Storage methods: incrementReferralCount(), creditUserWallet(), getReferralByReferredId()

- **Comprehensive Auto-Refresh**: All pages now auto-refresh data every 2-3 seconds
  - Critical data (orders, deposits, withdrawals, pending items): 2s
  - Other data (products, users, settings): 3s
  - All pages: AdminDashboard, SellerDashboard, BuyerDashboard, Deposit, Products, ProductDetail, Wishlist, Referral, SellerAnalytics, Chat

- **Pending Earnings System**: New seller earnings hold feature
  - Order payments are held for 3 days before transferring to seller's main wallet
  - Auto-release job runs every 30 minutes to release funds after 3-day hold period
  - Admin can manually approve (release early) or cancel held earnings via "Tạm giữ tiền" tab
  - Seller Dashboard shows pending earnings: "xxx đang giữ" in stats card and wallet tab
  - Database table: pendingEarnings with status (pending/released/cancelled), releaseAt timestamp

## Recent Changes & Fixes (Dec 4, 2025)
- **Inventory Management**: Sellers can now view, edit, and delete individual items in their product inventory
  - Click "Xem kho" button in seller dashboard to see all items
  - Select multiple items with checkboxes for bulk delete
  - Edit individual account details
  - Search and filter items
  - Status indicators: Còn hàng (available), Đang giữ (reserved), Đã bán (sold)
- **Updated Favicon**: New modern gradient favicon for better SEO/search visibility
  - Added apple-touch-icon and theme-color meta tags

## Recent Changes & Fixes (Dec 1, 2025)
- **Fixed Image Persistence**: Uploads now stored in persistent directory (`~/.data/uploads`) instead of workspace
  - Images no longer disappear after app restart
  - On cPanel: Set `UPLOAD_DIR` env var to a persistent path for production
- **Branding Updates**: Changed "MMO Store" to "Tạp Hóa Việt Max" throughout the app
- **Seller Order Deletion**: Added DELETE endpoint for sellers to remove pending_payment orders
- **Test Data Cleanup**: Removed test products and orders

## Features
- **Notification System**: Customizable notifications for key events
  - Notification settings page at `/notifications/settings`
  - Notification bell icon in header with unread count badge
  - Notification types: new_order, order_paid, new_message, kyc_update, withdrawal_update, deposit_update, product_approved, system
  - Users can toggle which notifications they receive
  - Sound enabled/email notifications settings (email coming soon)
  - Notifications are created for: order confirmations, message received, KYC approval/rejection, deposit/withdrawal status updates, product approvals
- **API Products Integration**: External product catalog from taphoammo.net API
  - Admin can configure API products with kioskToken, price, title
  - Products page has tabs for internal vs API products
  - Buyers can purchase API products directly with wallet balance
  - Instant delivery via external API
- **Chat Page**: Full messaging system at `/chat` with:
  - Admin chat always pinned at top with green indicator
  - Buyer-seller conversations
  - Order dispute handling
  - Real-time message updates
- **Deposit Approval**: Admin must approve deposit requests before crediting wallet
- **User Management**: Admin can view all users, ban/unban accounts
- **Review Management**: Admin can view all reviews, hide/show them
- **Deposit Page**: Standalone page for buyers to deposit money with QR code
- **Admin Dashboard**: Full suite with tabs: KYC, Products, Orders, Withdrawals, Reports, Sellers, Deposits, Users, Reviews, API Products
- **Payment Flow**: Orders → pending_payment → pending_confirmation → paid (with timestamps)
- **Wallet Transactions**: Track all wallet movements (credits/debits)
- **Admin Logs**: Audit trail for all admin actions

## API Endpoints
- `/api/auth/register` - Register new user (POST)
- `/api/auth/login` - Login with email/password (POST)
- `/api/auth/logout` - Logout (POST)
- `/api/auth/user` - Get current user
- `/api/products` - List products with filters
- `/api/products/:id` - Get product details
- `/api/orders` - Buyer orders
- `/api/seller/*` - Seller management endpoints
- `/api/admin/*` - Admin operations
- `/api/make-first-admin` - Make first user admin (POST)

## Pages
- `/` - Landing page
- `/products` - Product listing
- `/products/:id` - Product details
- `/cart` - Shopping cart
- `/dashboard` - Buyer dashboard
- `/deposit` - Deposit money page
- `/chat` - Chat messaging page
- `/wishlist` - Wishlist page
- `/referral` - Referral program page
- `/seller/register` - Seller registration
- `/seller` - Seller dashboard
- `/seller/analytics` - Seller analytics page
- `/admin/login` - Admin login page (separate from user login)
- `/admin` - Admin dashboard
- `/notifications/settings` - Notification settings page

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session encryption key
- `ADMIN_USERNAME` - Admin login username (default: animodadmin)
- `ADMIN_PASSWORD` - Admin login password
- `UPLOAD_DIR` - Persistent directory for file uploads (default: `/home/runner/.data/uploads`)
  - On cPanel: Set this to a persistent folder outside your app directory, e.g., `/home/username/data/uploads`
  - Images will persist across app restarts when set correctly

## Development
The app runs on port 5000. Use `npm run dev` to start the development server.

## Database Schema
See `shared/schema.ts` for complete schema including:
- users, sellers, products, product_items
- orders, wallet_transactions, withdrawals
- deposits, conversations, messages, reviews
- files, admin_logs, sessions
- notifications, notification_settings
- user_referral_codes, referrals
- flash_sales, flash_sale_products
- wishlists, bundles, bundle_items
- telegram_settings
- warranties, warranty_claims
- disputes, pricing_suggestions

## Recent Changes (Dec 5, 2025)
- **Chat Enhancements**:
  - Online/offline status indicators (green/gray dots) - users active within 5 minutes shown as online
  - Unread message red dot indicators on conversation list
  - Heartbeat system: sends activity ping every 30 seconds
  - Chat deep-linking with automatic conversation creation via `?sellerId=xxx` parameter
- **Notification System Improvements**:
  - Instant UI updates using optimistic mutations (no page refresh needed)
  - Notification sound toggle with localStorage persistence
  - Sound plays when new notifications arrive (after initial page load)
  - Reduced polling interval to 5 seconds for faster updates
- **Admin Broadcast Feature**:
  - New "Thông báo chung" tab in Admin Dashboard
  - Create platform-wide announcements with types: info, warning, promo
  - Set optional expiration dates for broadcasts
  - View/delete broadcast history
  - Broadcasts are sent as notifications to all users
- **Search Features**:
  - Added search to admin order management
  - Added search to seller order management

## Recent Changes (Dec 4, 2025)
- **Added 10 New Features**: Referral system, flash sales, wishlist, seller analytics, product bundles, auto pricing, Telegram notifications, product warranty, and dispute management
- **New Database Tables**: 12 new tables for advanced features
- **New Pages**: /wishlist, /referral, /seller/analytics
- **Enhanced Notifications**: Extended notification types for all new features
