-- Computer Dynamics v2 showcase schema (structure only, no data)
-- Exported from computer_dynamics.db on 2026-06-12T16:20:58.194Z
PRAGMA foreign_keys = OFF;

CREATE TABLE `activities` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `user_id` INTEGER NOT NULL REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `client_id` INTEGER REFERENCES "clients_backup" (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `ticket_id` INTEGER REFERENCES `tickets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `project_name` VARCHAR(100), `description` TEXT, `clock_in_time` DATETIME NOT NULL, `clock_out_time` DATETIME, `duration` INTEGER DEFAULT 0, `is_billable` TINYINT(1) NOT NULL DEFAULT 1, `hourly_rate` DECIMAL(10,2) DEFAULT 0, `total_amount` DECIMAL(10,2) DEFAULT 0, `status` VARCHAR(255) NOT NULL DEFAULT 'active', `category` VARCHAR(50), `tags` JSON DEFAULT '[]', `notes` TEXT, `is_active` TINYINT(1) NOT NULL DEFAULT 1, `created_at` DATETIME NOT NULL, `updated_at` DATETIME NOT NULL);

CREATE TABLE `backups` (`id` UUID PRIMARY KEY, `backup_type` TEXT NOT NULL, `backup_name` VARCHAR(255) NOT NULL, `file_path` VARCHAR(255) NOT NULL, `file_size` BIGINT, `status` TEXT DEFAULT 'pending', `start_time` DATETIME NOT NULL, `end_time` DATETIME, `duration` INTEGER, `checksum` VARCHAR(255), `compression_ratio` DECIMAL(5,2), `retention_date` DATETIME NOT NULL, `is_encrypted` TINYINT(1) DEFAULT 0, `encryption_key` VARCHAR(255), `notes` TEXT, `is_active` TINYINT(1) DEFAULT 1, `created_at` DATETIME NOT NULL, `updated_at` DATETIME NOT NULL);

CREATE TABLE calendar_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      notes TEXT,
      event_type TEXT NOT NULL DEFAULT 'sales_followup',
      scheduled_at TEXT NOT NULL,
      opportunity_id TEXT,
      client_id TEXT,
      created_by INTEGER,
      completed_at TEXT,
      created_at TEXT,
      updated_at TEXT
    );

CREATE TABLE chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id VARCHAR UNIQUE NOT NULL,
        sender_id INTEGER NOT NULL,
        sender_name VARCHAR NOT NULL,
        sender_role VARCHAR(20) NOT NULL,
        recipient_id INTEGER,
        recipient_name VARCHAR,
        recipient_role VARCHAR(20),
        message TEXT NOT NULL,
        message_type VARCHAR(20) DEFAULT 'text',
        is_read BOOLEAN DEFAULT 0,
        read_at DATETIME,
        is_active BOOLEAN DEFAULT 1,
        client_id INTEGER,
        ticket_id VARCHAR,
        metadata TEXT DEFAULT '{}',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (client_id) REFERENCES "clients_backup"(id) ON DELETE CASCADE
      );

CREATE TABLE `clearance_badges` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `badge_number` VARCHAR(20) NOT NULL UNIQUE, `user_id` INTEGER NOT NULL REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `clearance_level` TEXT NOT NULL, `issued_by` INTEGER NOT NULL REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `issued_at` DATETIME NOT NULL, `expires_at` DATETIME, `is_active` TINYINT(1) NOT NULL DEFAULT 1, `is_revoked` TINYINT(1) NOT NULL DEFAULT 0, `revoked_by` INTEGER REFERENCES `users` (`id`), `revoked_at` DATETIME, `revocation_reason` TEXT, `access_areas` JSON DEFAULT '[]', `restrictions` JSON DEFAULT '[]', `notes` TEXT);

CREATE TABLE clients (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        company_name TEXT,
        email TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        contact_person TEXT,
        billing_info TEXT,
        contract_details TEXT,
        service_level TEXT,
        support_tier TEXT NOT NULL DEFAULT 'silver',
        status TEXT NOT NULL DEFAULT 'active',
        start_date TEXT,
        end_date TEXT,
        monthly_rate REAL DEFAULT 0.00,
        notes TEXT,
        communication_history TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        usage_tracking TEXT,
        service_plan_data TEXT,
        assigned_technician_id TEXT,
        priority_level TEXT DEFAULT 'medium',
        contract_start_date TEXT,
        contract_end_date TEXT,
        renewal_date TEXT,
        sla_agreement TEXT,
        created_at TEXT,
        updated_at TEXT,
        userId INTEGER,
        contact_number VARCHAR(255),
        emergency_contact VARCHAR(255),
        emergency_phone VARCHAR(255)
      , features TEXT DEFAULT '[]');

CREATE TABLE `emergency_overrides` (`id` UUID PRIMARY KEY, `user_id` UUID NOT NULL REFERENCES `Users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `override_type` TEXT NOT NULL, `reason` TEXT NOT NULL, `authorization_code` VARCHAR(255) NOT NULL, `start_time` DATETIME NOT NULL, `end_time` DATETIME, `duration` INTEGER, `status` TEXT DEFAULT 'active', `actions_performed` JSON DEFAULT '[]', `ip_address` VARCHAR(255), `user_agent` VARCHAR(255), `risk_level` TEXT DEFAULT 'medium', `post_incident_analysis` TEXT, `is_active` TINYINT(1) DEFAULT 1, `created_at` DATETIME NOT NULL, `updated_at` DATETIME NOT NULL);

CREATE TABLE `file_uploads` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `original_name` VARCHAR(255) NOT NULL, `file_name` VARCHAR(255) NOT NULL UNIQUE, `file_path` VARCHAR(500) NOT NULL, `file_size` INTEGER NOT NULL, `mime_type` VARCHAR(100) NOT NULL, `extension` VARCHAR(20), `uploaded_by` INTEGER NOT NULL REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `client_id` INTEGER REFERENCES "clients_backup" (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `ticket_id` INTEGER REFERENCES `tickets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `category` VARCHAR(50), `tags` JSON DEFAULT '[]', `description` TEXT, `is_public` TINYINT(1) NOT NULL DEFAULT 0, `access_level` TEXT NOT NULL DEFAULT 'private', `allowed_users` JSON DEFAULT '[]', `allowed_roles` JSON DEFAULT '[]', `download_count` INTEGER NOT NULL DEFAULT 0, `last_downloaded` DATETIME, `is_active` TINYINT(1) NOT NULL DEFAULT 1, `metadata` JSON DEFAULT '{}');

CREATE TABLE invoices (
          id TEXT PRIMARY KEY,
          client_id TEXT NOT NULL,
          created_by INTEGER NOT NULL,
          invoice_number VARCHAR(255) NOT NULL UNIQUE,
          amount DECIMAL(10,2) NOT NULL,
          paidAmount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          currency VARCHAR(255) NOT NULL DEFAULT 'TTD',
          status TEXT NOT NULL DEFAULT 'pending',
          due_date DATETIME NOT NULL,
          paid_date DATETIME NULL,
          billing_cycle TEXT NOT NULL DEFAULT 'monthly',
          payment_gateway TEXT NOT NULL DEFAULT 'CASH',
          description TEXT NULL,
          items TEXT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (client_id) REFERENCES clients(id),
          FOREIGN KEY (created_by) REFERENCES users(id)
        );

CREATE TABLE `job_links` (`id` UUID PRIMARY KEY, `job_id` UUID NOT NULL REFERENCES `jobs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `linked_type` TEXT NOT NULL, `linked_id` UUID NOT NULL, `linked_number` VARCHAR(50) NOT NULL, `link_date` DATETIME NOT NULL, `linked_by` UUID NOT NULL REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `notes` TEXT, `is_active` TINYINT(1) NOT NULL DEFAULT 1, `created_at` DATETIME NOT NULL, `updated_at` DATETIME NOT NULL);

CREATE TABLE `jobs` (`id` UUID PRIMARY KEY, `client_id` UUID NOT NULL REFERENCES "clients_backup" (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `job_number` VARCHAR(50) NOT NULL UNIQUE, `title` VARCHAR(200) NOT NULL, `description` TEXT, `status` TEXT NOT NULL DEFAULT 'active', `priority` TEXT NOT NULL DEFAULT 'medium', `start_date` DATETIME NOT NULL, `end_date` DATETIME, `estimated_hours` DECIMAL(5,2) DEFAULT 0, `actual_hours` DECIMAL(5,2) DEFAULT 0, `estimated_cost` DECIMAL(10,2) DEFAULT 0, `actual_cost` DECIMAL(10,2) DEFAULT 0, `assigned_technician_id` UUID REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE, `created_by` UUID NOT NULL REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `tags` TEXT DEFAULT '[]', `notes` TEXT, `is_active` TINYINT(1) NOT NULL DEFAULT 1, `created_at` DATETIME NOT NULL, `updated_at` DATETIME NOT NULL);

CREATE TABLE `notice_board` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `title` VARCHAR(200) NOT NULL, `content` TEXT NOT NULL, `author_id` INTEGER NOT NULL REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `priority` TEXT NOT NULL DEFAULT 'normal', `category` VARCHAR(50), `target_audience` TEXT NOT NULL DEFAULT 'all', `target_roles` JSON DEFAULT '[]', `target_users` JSON DEFAULT '[]', `is_pinned` TINYINT(1) NOT NULL DEFAULT 0, `is_active` TINYINT(1) NOT NULL DEFAULT 1, `publish_at` DATETIME NOT NULL, `expires_at` DATETIME, `attachments` JSON DEFAULT '[]', `tags` JSON DEFAULT '[]');

CREATE TABLE `notifications` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `user_id` INTEGER NOT NULL REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `created_by_id` INTEGER REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `title` VARCHAR(200) NOT NULL, `message` TEXT NOT NULL, `type` TEXT NOT NULL DEFAULT 'info', `priority` TEXT NOT NULL DEFAULT 'normal', `category` VARCHAR(50), `is_read` TINYINT(1) NOT NULL DEFAULT 0, `read_at` DATETIME, `action_url` VARCHAR(500), `action_text` VARCHAR(100), `metadata` JSON DEFAULT '{}', `expires_at` DATETIME, `is_active` TINYINT(1) NOT NULL DEFAULT 1);

CREATE TABLE `order_links` (`id` UUID PRIMARY KEY, `orderId` UUID NOT NULL REFERENCES `orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `linkedType` TEXT NOT NULL, `linkedId` UUID NOT NULL, `linkedNumber` VARCHAR(50) NOT NULL, `linkDate` DATETIME NOT NULL, `linkedBy` UUID NOT NULL REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `notes` TEXT, `isActive` TINYINT(1) NOT NULL DEFAULT 1, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL);

CREATE TABLE `orders` (`id` UUID PRIMARY KEY, `orderNumber` VARCHAR(50) NOT NULL UNIQUE, `clientId` UUID NOT NULL REFERENCES "clients_backup" (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `title` VARCHAR(200) NOT NULL, `description` TEXT, `itemName` VARCHAR(200) NOT NULL, `itemUrl` TEXT, `vendor` VARCHAR(100), `vendorOrderNumber` VARCHAR(100), `trackingNumber` VARCHAR(100), `orderDate` DATETIME NOT NULL, `estimatedArrival` DATETIME, `actualArrival` DATETIME, `costPrice` DECIMAL(10,2) NOT NULL DEFAULT 0, `clientPrice` DECIMAL(10,2) NOT NULL DEFAULT 0, `quantity` INTEGER NOT NULL DEFAULT 1, `status` TEXT NOT NULL DEFAULT 'ordered', `isLoggedInPreAlerts` TINYINT(1) NOT NULL DEFAULT 0, `preAlertNotes` TEXT, `assignedTechnicianId` UUID REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE, `createdBy` UUID NOT NULL REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `tags` TEXT DEFAULT '[]', `notes` TEXT, `isActive` TINYINT(1) NOT NULL DEFAULT 1, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL, currentLocation VARCHAR(200), locationHistory TEXT DEFAULT '[]', lastLocationUpdate DATETIME, shippingStage VARCHAR(50) DEFAULT 'ordered', `current_location` VARCHAR(255), `location_history` TEXT, `last_location_update` DATETIME, `shipping_stage` TEXT NOT NULL DEFAULT 'ordered', `is_logged_in_pre_alerts` TINYINT(1) NOT NULL DEFAULT 0, `pre_alert_notes` TEXT, serialNumber TEXT);

CREATE TABLE `payments` (`id` UUID PRIMARY KEY, `invoice_id` UUID NOT NULL REFERENCES `Invoices` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `amount` DECIMAL(10,2) NOT NULL, `payment_method` TEXT NOT NULL DEFAULT 'CASH', `payment_date` DATETIME NOT NULL, `processed_by` UUID NOT NULL REFERENCES `Users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `reference` VARCHAR(255), `notes` TEXT, `status` TEXT NOT NULL DEFAULT 'completed', `created_at` DATETIME NOT NULL, `updated_at` DATETIME NOT NULL);

CREATE TABLE `payroll` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `user_id` INTEGER NOT NULL REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `base_pay_rate` DECIMAL(10,2) NOT NULL DEFAULT 0, `adjustment_type` TEXT NOT NULL, `adjustment_amount` DECIMAL(10,2) NOT NULL DEFAULT 0, `description` TEXT NOT NULL, `pay_period` TEXT NOT NULL DEFAULT 'weekly', `start_date` DATETIME NOT NULL, `end_date` DATETIME NOT NULL, `is_active` TINYINT(1) NOT NULL DEFAULT 1, `created_by` INTEGER NOT NULL REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE `payslips` (`id` UUID PRIMARY KEY, `user_id` INTEGER NOT NULL REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `pay_period` TEXT NOT NULL, `start_date` DATETIME NOT NULL, `end_date` DATETIME NOT NULL, `total_hours` DECIMAL(10,2) NOT NULL DEFAULT 0, `base_pay_rate` DECIMAL(10,2) NOT NULL DEFAULT 0, `base_pay` DECIMAL(10,2) NOT NULL DEFAULT 0, `adjustments` DECIMAL(10,2) NOT NULL DEFAULT 0, `gross_pay` DECIMAL(10,2) NOT NULL DEFAULT 0, `deductions` DECIMAL(10,2) NOT NULL DEFAULT 0, `net_pay` DECIMAL(10,2) NOT NULL DEFAULT 0, `adjustment_details` JSON DEFAULT '[]', `activity_details` JSON DEFAULT '[]', `status` TEXT NOT NULL DEFAULT 'pending', `processed_by` INTEGER NOT NULL REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `processed_at` DATETIME, `email_sent` TINYINT(1) NOT NULL DEFAULT 0, `email_sent_at` DATETIME, `email_error` TEXT, `payslip_number` VARCHAR(255) NOT NULL UNIQUE, `notes` TEXT, `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE `product_categories` (`id` VARCHAR(255) PRIMARY KEY, `name` VARCHAR(255) NOT NULL, `description` TEXT, `color` VARCHAR(255), `isActive` INTEGER NOT NULL);

CREATE TABLE `product_usage` (`id` UUID PRIMARY KEY, `productId` UUID NOT NULL REFERENCES `products_services` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `clientId` UUID REFERENCES "clients_backup" (`id`) ON DELETE SET NULL ON UPDATE CASCADE, `jobId` UUID REFERENCES `jobs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE, `orderId` UUID REFERENCES `orders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE, `quantity` INTEGER NOT NULL DEFAULT 1, `unitPrice` DECIMAL(10,2) NOT NULL, `totalPrice` DECIMAL(10,2) NOT NULL, `usageDate` DATETIME NOT NULL, `notes` TEXT, `created_at` DATETIME NOT NULL, `updated_at` DATETIME NOT NULL);

CREATE TABLE `products_services` (`id` UUID PRIMARY KEY, `name` VARCHAR(200) NOT NULL, `code` VARCHAR(50) NOT NULL UNIQUE, `categoryId` UUID REFERENCES `product_categories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE, `type` TEXT NOT NULL DEFAULT 'product', `description` TEXT, `available` INTEGER DEFAULT NULL, `ordered` INTEGER NOT NULL DEFAULT 0, `minimumStock` INTEGER DEFAULT NULL, `costPrice` DECIMAL(10,2) NOT NULL DEFAULT 0, `retailPrice` DECIMAL(10,2) NOT NULL DEFAULT 0, `marginPercentage` DECIMAL(5,2) DEFAULT NULL, `marginAmount` DECIMAL(10,2) DEFAULT NULL, `location` VARCHAR(100), `supplier` VARCHAR(100), `supplierCode` VARCHAR(50), `status` TEXT NOT NULL DEFAULT 'active', `isService` TINYINT(1) NOT NULL DEFAULT 0, `requiresInstallation` TINYINT(1) NOT NULL DEFAULT 0, `installationTime` INTEGER DEFAULT NULL, `warranty` VARCHAR(100), `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL, `is_service` TINYINT(1) NOT NULL DEFAULT 0, `requires_installation` TINYINT(1) NOT NULL DEFAULT 0, `installation_time` INTEGER, `margin_percentage` DECIMAL(5,2), `margin_amount` DECIMAL(10,2), `imageUrl` VARCHAR(500) DEFAULT NULL);

CREATE TABLE `quotes` (`id` UUID PRIMARY KEY, `client_id` UUID NOT NULL REFERENCES "clients_backup" (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `created_by` UUID NOT NULL REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `quote_number` VARCHAR(255) NOT NULL UNIQUE, `title` VARCHAR(200) NOT NULL, `description` TEXT, `amount` DECIMAL(10,2) NOT NULL, `currency` VARCHAR(255) NOT NULL DEFAULT 'TTD', `status` TEXT NOT NULL DEFAULT 'draft', `valid_until` DATETIME NOT NULL, `accepted_date` DATETIME, `converted_to_invoice_id` UUID REFERENCES `invoices` (`id`) ON DELETE SET NULL ON UPDATE CASCADE, `items` TEXT, `terms` TEXT, `notes` TEXT, `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE sales_opportunities (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      product TEXT NOT NULL CHECK(product IN ('document','auto','distribution','ecommerce')),
      stage TEXT NOT NULL DEFAULT 'cold_prospect' CHECK(stage IN ('cold_prospect','contact_made','demo_completed','proposal_sent','won','lost')),
      deal_type TEXT CHECK(deal_type IN ('subscription','standalone')),
      monthly_rate REAL,
      project_value REAL,
      deposit_amount REAL,
      scope_notes TEXT,
      pitch_notes TEXT,
      demo_notes TEXT,
      contact_channel TEXT,
      contact_made_at TEXT,
      demo_completed_at TEXT,
      quote_id TEXT,
      client_id TEXT,
      lost_reason TEXT,
      communications TEXT DEFAULT '[]',
      created_by INTEGER,
      assigned_to INTEGER,
      won_at TEXT,
      lost_at TEXT,
      created_at TEXT,
      updated_at TEXT
    );

CREATE TABLE `security_events` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `event_type` TEXT NOT NULL, `severity` TEXT NOT NULL DEFAULT 'medium', `user_id` INTEGER REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `ip_address` VARCHAR(45), `user_agent` TEXT, `description` TEXT NOT NULL, `details` JSON DEFAULT '{}', `file_path` VARCHAR(500), `action` VARCHAR(100), `outcome` TEXT NOT NULL DEFAULT 'monitored', `ai_response` JSON DEFAULT '{}', `threat_level` INTEGER DEFAULT 1, `is_resolved` TINYINT(1) NOT NULL DEFAULT 0, `resolved_by` INTEGER REFERENCES `users` (`id`), `resolved_at` DATETIME, `resolution_notes` TEXT, `is_active` TINYINT(1) NOT NULL DEFAULT 1, `created_at` DATETIME NOT NULL, `updated_at` DATETIME NOT NULL);

CREATE TABLE `sessions` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `session_id` VARCHAR(255) NOT NULL UNIQUE, `user_id` INTEGER NOT NULL REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `ip_address` VARCHAR(45), `user_agent` TEXT, `device_info` JSON DEFAULT '{}', `login_time` DATETIME NOT NULL, `last_activity` DATETIME NOT NULL, `logout_time` DATETIME, `is_active` TINYINT(1) NOT NULL DEFAULT 1, `is_expired` TINYINT(1) NOT NULL DEFAULT 0, `expires_at` DATETIME, `security_level` TEXT NOT NULL DEFAULT 'medium', `location` JSON DEFAULT '{}', `metadata` JSON DEFAULT '{}');

CREATE TABLE `sla_violations` (`id` UUID PRIMARY KEY, `ticket_id` UUID NOT NULL REFERENCES `Tickets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `sla_id` UUID NOT NULL REFERENCES `SLAs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `violation_type` TEXT NOT NULL, `expected_time` INTEGER NOT NULL, `actual_time` INTEGER NOT NULL, `violation_duration` INTEGER NOT NULL, `severity` TEXT DEFAULT 'medium', `status` TEXT DEFAULT 'open', `escalation_level` INTEGER DEFAULT 0, `notes` TEXT, `is_active` TINYINT(1) DEFAULT 1, `created_at` DATETIME NOT NULL, `updated_at` DATETIME NOT NULL);

CREATE TABLE `slas` (`id` UUID PRIMARY KEY, `client_id` UUID NOT NULL REFERENCES "clients_backup" (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `name` VARCHAR(255) NOT NULL, `description` TEXT, `response_time` INTEGER NOT NULL, `resolution_time` INTEGER NOT NULL, `uptime` DECIMAL(5,2) NOT NULL, `status` TEXT NOT NULL DEFAULT 'active', `start_date` DATETIME NOT NULL, `end_date` DATETIME, `created_at` DATETIME NOT NULL, `updated_at` DATETIME NOT NULL);

CREATE TABLE `system_configs` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `key` VARCHAR(100) NOT NULL UNIQUE, `value` TEXT NOT NULL, `type` TEXT NOT NULL DEFAULT 'string', `category` VARCHAR(50) NOT NULL DEFAULT 'general', `description` TEXT, `is_editable` TINYINT(1) NOT NULL DEFAULT 1, `is_public` TINYINT(1) NOT NULL DEFAULT 0, `requires_restart` TINYINT(1) NOT NULL DEFAULT 0, `validation` JSON DEFAULT '{}', `default_value` TEXT, `is_active` TINYINT(1) NOT NULL DEFAULT 1);

CREATE TABLE ticket_comments (
          id TEXT PRIMARY KEY,
          ticketId TEXT NOT NULL,
          comment TEXT NOT NULL,
          commentType TEXT NOT NULL DEFAULT 'update',
          authorId TEXT NOT NULL,
          authorName TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          isInternal INTEGER NOT NULL DEFAULT 0,
          isActive INTEGER NOT NULL DEFAULT 1,
          linkedOrderId TEXT,
          FOREIGN KEY (ticketId) REFERENCES tickets(id) ON DELETE CASCADE,
          FOREIGN KEY (authorId) REFERENCES users(id) ON DELETE CASCADE
        );

CREATE TABLE tickets (
          id TEXT PRIMARY KEY,
          ticketNumber TEXT NOT NULL UNIQUE,
          clientName TEXT NOT NULL,
          clientContactNumber TEXT,
          issue TEXT NOT NULL,
          location TEXT NOT NULL,
          deviceType TEXT NOT NULL,
          deviceModel TEXT,
          serialNumber TEXT,
          status TEXT NOT NULL DEFAULT 'New',
          technician TEXT NOT NULL,
          notes TEXT,
          priority TEXT DEFAULT 'medium',
          category TEXT DEFAULT 'general',
          dueDate TEXT,
          dateCreated TEXT NOT NULL,
          lastUpdated TEXT NOT NULL,
          subscription TEXT,
          isActive INTEGER NOT NULL DEFAULT 1,
          clientId TEXT,
          createdBy INTEGER,
          assignedTo INTEGER,
          hasUnreadClientComments INTEGER NOT NULL DEFAULT 0,
          lastClientCommentAt DATETIME,
          attachments JSON NOT NULL DEFAULT '[]',
          tags JSON NOT NULL DEFAULT '[]',
          resolution_notes TEXT,
          client_contact_number VARCHAR(255),
          has_unread_client_comments INTEGER NOT NULL DEFAULT 0,
          last_client_comment_at DATETIME,
          estimated_hours DECIMAL(5,2),
          actual_hours DECIMAL(5,2),
          estimated_cost DECIMAL(10,2),
          actual_cost DECIMAL(10,2), title TEXT,
          FOREIGN KEY (clientId) REFERENCES clients(id),
          FOREIGN KEY (createdBy) REFERENCES users(id),
          FOREIGN KEY (assignedTo) REFERENCES users(id)
        );

CREATE TABLE `user_activities` (`id` UUID PRIMARY KEY, `user_id` UUID NOT NULL REFERENCES `Users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, `activity_type` TEXT NOT NULL, `module` VARCHAR(255) NOT NULL, `action` VARCHAR(255) NOT NULL, `resource` VARCHAR(255), `resource_id` UUID, `details` JSON, `ip_address` VARCHAR(255), `user_agent` VARCHAR(255), `session_id` VARCHAR(255), `success` TINYINT(1) DEFAULT 1, `error_message` TEXT, `risk_level` TEXT DEFAULT 'low', `is_active` TINYINT(1) DEFAULT 1, `created_at` DATETIME NOT NULL, `updated_at` DATETIME NOT NULL);

CREATE TABLE `users` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `username` VARCHAR(50) NOT NULL UNIQUE, `email` VARCHAR(100) NOT NULL UNIQUE, `password` VARCHAR(255) NOT NULL, `first_name` VARCHAR(50) NOT NULL, `last_name` VARCHAR(50) NOT NULL, `role` TEXT NOT NULL DEFAULT 'client', `security_clearance` TEXT NOT NULL DEFAULT 'S-CLS3', `is_active` TINYINT(1) NOT NULL DEFAULT 1, `is_locked` TINYINT(1) NOT NULL DEFAULT 0, `failed_login_attempts` INTEGER NOT NULL DEFAULT 0, `last_login_at` DATETIME, `lockout_until` DATETIME, `bio` TEXT, `phone` VARCHAR(20), `profile_picture` VARCHAR(255), `emergency_contact` JSON, `preferences` JSON DEFAULT '{}', `created_at` DATETIME NOT NULL, `updated_at` DATETIME NOT NULL, `tempPassword` VARCHAR(255), `passwordSet` TINYINT(1) NOT NULL DEFAULT 0, `firstLoginAt` DATETIME, `last_login` DATETIME, `login_attempts` INTEGER NOT NULL DEFAULT 0, `locked_until` DATETIME, `two_factor_enabled` TINYINT(1) NOT NULL DEFAULT 0, `two_factor_secret` VARCHAR(255));

CREATE INDEX `activities_client_id` ON `activities` (`client_id`);

CREATE INDEX `activities_clock_in_time` ON `activities` (`clock_in_time`);

CREATE INDEX `activities_ticket_id` ON `activities` (`ticket_id`);

CREATE INDEX `activities_user_id` ON `activities` (`user_id`);

CREATE INDEX `clients_assigned_technician_id` ON "clients_backup" (`assigned_technician_id`);

CREATE INDEX `clients_email` ON "clients_backup" (`email`);

CREATE INDEX `clients_status` ON "clients_backup" (`status`);

CREATE INDEX `clients_user_id` ON "clients_backup" (`userId`);

CREATE INDEX `idx_activities_client_created` ON `activities` (`client_id`, `created_at`);

CREATE INDEX `idx_activities_is_active` ON `activities` (`is_active`);

CREATE INDEX idx_chats_client_id ON chats(client_id);

CREATE INDEX idx_chats_created_at ON chats(created_at);

CREATE INDEX idx_chats_is_read ON chats(is_read);

CREATE INDEX idx_chats_recipient_id ON chats(recipient_id);

CREATE INDEX idx_chats_sender_id ON chats(sender_id);

CREATE INDEX idx_chats_ticket_id ON chats(ticket_id);

CREATE INDEX idx_clients_userId ON "clients_backup"(userId);

CREATE INDEX idx_orders_clientId ON orders(clientId);

CREATE INDEX `idx_orders_client_status_active` ON `orders` (`clientId`, `status`, `isActive`);

CREATE INDEX idx_orders_orderDate ON orders(orderDate);

CREATE INDEX idx_orders_status ON orders(status);

CREATE INDEX idx_ticket_comments_ticket_id 
        ON ticket_comments(ticketId);

CREATE INDEX idx_ticket_comments_timestamp 
        ON ticket_comments(timestamp);

CREATE INDEX idx_users_passwordSet ON users(passwordSet);

CREATE INDEX idx_users_role_passwordSet ON users(role, passwordSet);

CREATE UNIQUE INDEX `job_links_unique_link` ON `job_links` (`job_id`, `linked_type`, `linked_id`);

CREATE INDEX `order_links_linked_item` ON `order_links` (`linkedType`, `linkedId`);

CREATE INDEX `order_links_order_id` ON `order_links` (`orderId`);

CREATE INDEX `orders_assigned_technician` ON `orders` (`assignedTechnicianId`);

CREATE INDEX `orders_client_id` ON `orders` (`clientId`);

CREATE INDEX `orders_created_by` ON `orders` (`createdBy`);

CREATE INDEX `orders_order_date` ON `orders` (`orderDate`);

CREATE INDEX `orders_pre_alerts` ON `orders` (`isLoggedInPreAlerts`);

CREATE INDEX `orders_shipping_stage` ON `orders` (`shippingStage`);

CREATE INDEX `orders_status` ON `orders` (`status`);

CREATE INDEX `orders_tracking_number` ON `orders` (`trackingNumber`);

CREATE INDEX `payroll_adjustment_type` ON `payroll` (`adjustment_type`);

CREATE INDEX `payroll_is_active` ON `payroll` (`is_active`);

CREATE INDEX `payroll_user_id_start_date_end_date` ON `payroll` (`user_id`, `start_date`, `end_date`);

CREATE INDEX `payslips_payslip_number` ON `payslips` (`payslip_number`);

CREATE INDEX `payslips_processed_at` ON `payslips` (`processed_at`);

CREATE INDEX `payslips_status` ON `payslips` (`status`);

CREATE INDEX `payslips_user_id_start_date_end_date` ON `payslips` (`user_id`, `start_date`, `end_date`);

CREATE INDEX `product_usage_client_index` ON `product_usage` (`clientId`);

CREATE INDEX `product_usage_date_index` ON `product_usage` (`usageDate`);

CREATE INDEX `product_usage_product_index` ON `product_usage` (`productId`);

CREATE INDEX `products_services_category_index` ON `products_services` (`categoryId`);

CREATE UNIQUE INDEX `products_services_code_unique` ON `products_services` (`code`);

CREATE INDEX `products_services_status_index` ON `products_services` (`status`);

CREATE INDEX `products_services_type_index` ON `products_services` (`type`);

CREATE INDEX `quotes_client_id` ON `quotes` (`client_id`);

CREATE INDEX `quotes_created_at` ON `quotes` (`created_at`);

CREATE INDEX `quotes_created_by` ON `quotes` (`created_by`);

CREATE INDEX `quotes_status` ON `quotes` (`status`);

CREATE INDEX `quotes_valid_until` ON `quotes` (`valid_until`);

CREATE UNIQUE INDEX `users_email` ON `users` (`email`);

CREATE INDEX `users_is_active` ON `users` (`is_active`);

CREATE INDEX `users_password_set` ON `users` (`passwordSet`);

CREATE INDEX `users_role` ON `users` (`role`);

CREATE INDEX `users_role_password_set` ON `users` (`role`, `passwordSet`);

CREATE UNIQUE INDEX `users_username` ON `users` (`username`);

PRAGMA foreign_keys = ON;
