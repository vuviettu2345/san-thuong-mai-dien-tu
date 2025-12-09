# Design Guidelines — MMO_STORE Marketplace

## Design Approach

**Framework:** Material Design-inspired system for multi-role marketplace
**Rationale:** Information-dense platform requiring clear hierarchy, efficient workflows, and trust signals across buyer, seller, and admin interfaces
**Key Principles:** Functional clarity, trust-building transparency, role-appropriate density, Vietnamese market standards

---

## Typography System

**Font Family:** Inter (Google Fonts) / system-ui fallback

**Hierarchy:**
- H1 Page Titles: `text-3xl font-bold`
- H2 Section Headers: `text-2xl font-semibold`
- H3 Card Titles: `text-xl font-semibold`
- H4 Subsections: `text-lg font-medium`
- Body: `text-base` (16px)
- Labels/Meta: `text-sm`
- Helper/Micro: `text-xs`

**Weight Distribution:**
- Bold (700): Titles, primary CTAs, pricing
- Semibold (600): Headers, card titles
- Medium (500): Table headers, labels
- Regular (400): Body, descriptions, inputs

---

## Layout System

**Spacing Primitives:** Tailwind units **2, 4, 6, 8, 12, 16**
- Card padding: `p-6, p-8`
- Grid gaps: `gap-4, gap-6`
- Section spacing: `space-y-6, space-y-8`

**Grid Patterns:**
- Product Grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
- Dashboard Stats: `grid-cols-1 lg:grid-cols-3`
- Admin Tables: Full-width responsive with horizontal scroll
- Forms: Single column, `max-w-2xl` for readability

**Container Widths:**
- Dashboards: `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`
- Buyer Pages: `max-w-6xl mx-auto px-4`
- Checkout/Forms: `max-w-3xl mx-auto`

---

## Component Library

### Navigation

**Admin/Seller Sidebar:**
- Fixed left `w-64` on desktop, drawer on mobile
- Vertical nav with Heroicons + labels
- Active state: background highlight, bold text, left accent border
- Structure: Logo top → nav items → user profile bottom

**Buyer Header:**
- Horizontal sticky navbar
- Layout: Logo left, search bar center, cart + account icons right
- Mobile: Hamburger with slide-out menu

### Hero Section (Buyer Homepage)

**Layout:**
- Height: `h-96` (not full viewport)
- Background: High-quality image of digital workspace, smartphones with social media apps, or abstract tech pattern
- Content positioning: Centered with blur-backdrop container
- Search bar: Prominent center placement, wide input with category dropdown + search button
- Headline: `text-4xl font-bold` with subtext `text-lg`
- Background treatment: Subtle gradient overlay for text readability
- Buttons on hero: Use `backdrop-blur-md bg-white/20 border border-white/30` for glass-morphism effect

### Status Badges

**Variants (used across orders, KYC, products):**
- Pending: `bg-yellow-100 text-yellow-800 text-xs font-medium px-3 py-1 rounded-full`
- Approved/Active: `bg-green-100 text-green-800`
- Rejected/Cancelled: `bg-red-100 text-red-800`
- Reserved: `bg-blue-100 text-blue-800`
- Draft: `bg-gray-100 text-gray-800`

### Data Tables

**Structure:**
- Zebra striping for readability
- Sticky header on scroll
- Action column right-aligned with icon buttons
- Sortable headers with arrow indicators
- Pagination: 10/25/50 options with page numbers
- Mobile: Horizontal scroll with pinned first column

### Cards

**Product Cards:**
- Image: 4:3 aspect ratio with platform logo (Facebook, Gmail, etc.)
- Title: Truncate at 2 lines, `text-lg font-semibold`
- Price: Large, bold display
- Metadata row: Stock count, seller name `text-sm text-gray-600`
- Hover: Subtle shadow lift
- Badge overlay: "Bán chạy" or "Mới" top-right corner

**Dashboard Stats Cards:**
- Number: `text-4xl font-bold`
- Label: `text-sm text-gray-600`
- Icon: Circular background with accent tint
- 4-card row for key metrics

**KYC Review Cards:**
- Grid display: CCCD front + back, Selfie with CCCD
- Click to expand: Lightbox with zoom
- Action buttons: Approve (green) / Reject (red) below images
- Status timeline sidebar showing review history

### Forms

**Input Structure:**
- Label: `text-sm font-medium mb-2` above input
- Input height: `h-12` for text fields
- Textarea: `min-h-32`
- Border: `border border-gray-300 rounded-lg`
- Focus: `focus:ring-2 focus:ring-blue-500`
- Error: `border-red-300` with `text-sm text-red-600 mt-1` message

**File Upload (KYC, CSV):**
- Dashed border drag zone with centered upload icon
- File preview: Thumbnail + filename + remove button
- CSV: Show parsed table preview before submission
- Multi-file: Display as grid of previews

### Buttons

**Primary:** `bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium`
**Secondary:** `bg-white border-2 border-gray-300 hover:border-gray-400 px-6 py-3 rounded-lg`
**Danger:** `bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg`
**Icon Buttons:** `p-2 rounded-lg hover:bg-gray-100`

### QR Payment Modal

**Layout:**
- Modal width: `max-w-md` centered
- QR code: Full-width image from VietQR URL
- Amount: `text-3xl font-bold` above QR
- Transfer details: Bordered card below QR (bank name, account number, transfer note)
- CTA: "Tôi đã chuyển khoản" full-width primary button
- Receipt upload: Input field below for payment proof

### Modals

**Standard Modal:**
- Backdrop: `bg-black/50`
- Container: `bg-white rounded-xl shadow-2xl max-w-lg p-6`
- Header: Title + close icon
- Footer: Right-aligned action buttons

**Confirmation Dialogs:**
- Centered icon (checkmark/warning)
- Centered message text
- Two buttons: Cancel (secondary) left, Confirm (primary) right

### Notifications

**Toast Position:** Top-right, auto-dismiss 3s
**Variants:** Green border (success), red (error), blue (info)
**Structure:** Icon + message + close button

---

## Role-Specific Layouts

### Buyer Pages

**Homepage:**
- Hero section with search (h-96, image background as described above)
- Category navigation: Horizontal scrollable cards with icons (Facebook, Gmail, TikTok, etc.)
- Featured products grid below
- Trust indicators section: Review count, seller stats, secure payment badges

**Product Detail:**
- Two-column: Left (40%) image gallery, Right (60%) details
- Product info: Title, price, stock, description
- Seller card: Avatar, name, join date, rating stars
- Purchase panel: Quantity selector, "Mua ngay" + "Thêm vào giỏ" buttons
- Related products carousel at bottom

**Checkout:**
- Multi-step indicator: Cart → Info → Payment → Confirm
- Single column form flow
- Order summary: Sticky card on desktop sidebar
- Payment method selector: QR transfer (default), wallet balance

### Seller Dashboard

**Overview:**
- Stats grid: Revenue today/month, pending orders, wallet balance, active products
- Recent orders table with quick actions
- Quick links: Add product button (prominent blue), upload CSV, request withdrawal

**Product Management:**
- Table view with status toggles (active/inactive)
- Bulk actions toolbar: CSV upload, delete selected
- Each row: Edit icon, duplicate icon, view stats icon

**Withdrawal Requests:**
- Form: Amount input, bank dropdown, account number
- Current balance display card
- Warning for minimum threshold
- History table: Date, amount, status, processing time

### Admin Panel

**KYC Review Queue:**
- Grid of pending cards (3 columns)
- Filter tabs: Pending, Approved, Rejected
- Click card: Full-screen viewer with side-by-side images
- Bulk approve/reject checkboxes

**Order Management:**
- Advanced filters: Date range, status multi-select, seller search
- Bulk payment approval for selected orders
- Order detail modal: Complete timeline, buyer/seller info, payment proof viewer

**Analytics Dashboard:**
- Date range picker top-right
- Revenue chart: Line graph showing daily trends
- Stats cards: Orders, revenue, commission, active users
- Top sellers leaderboard table
- Export CSV button for reports

---

## Images & Assets

**Icons:** Heroicons exclusively - outline for nav, solid for status
**Product Images:** Platform brand logos (Facebook blue, Gmail colors, TikTok black) as primary visuals
**Hero Image:** Digital workspace scene with multiple phones showing social apps, modern desk setup, or abstract tech pattern with blue accent tones
**Avatars:** Circular 40px, initials fallback
**KYC Documents:** Viewer with pinch-zoom capability

---

## Polish & States

**Loading:** Skeleton screens for tables/cards, button spinners
**Empty States:** Centered illustration + message + action button
**Disabled:** `opacity-50 cursor-not-allowed`
**Error States:** Visual (border) + text indicators
**Success Feedback:** Green checkmark animations for completed actions

**Minimal Animations:** Modal fade-in, sidebar slide, loading spinners only