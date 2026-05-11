-- Purpose: Drop the Node runtime SQLite schema for local reset or restore drills.
-- Scope: Destructive. Run only against a database that can be recreated.

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS ExhibitorConfirmationEvents;
DROP TABLE IF EXISTS ExhibitorConfirmationLinks;
DROP TABLE IF EXISTS ExhibitionConfirmationSettings;
DROP TABLE IF EXISTS ExhibitionSpecialDecorationReports;
DROP TABLE IF EXISTS ExhibitionLintels;
DROP TABLE IF EXISTS ExhibitionRefrigeratorRentalItems;
DROP TABLE IF EXISTS ExhibitionRefrigeratorRentals;
DROP TABLE IF EXISTS ExhibitionRefrigeratorConfigs;
DROP TABLE IF EXISTS BoothMapItems;
DROP TABLE IF EXISTS BoothMaps;
DROP TABLE IF EXISTS OrderBoothChanges;
DROP TABLE IF EXISTS OrderOverpaymentIssues;
DROP TABLE IF EXISTS Agents;
DROP TABLE IF EXISTS Expenses;
DROP TABLE IF EXISTS ProjectOrderReleaseSettings;
DROP TABLE IF EXISTS ProjectOrderFieldSettings;
DROP TABLE IF EXISTS ProjectErpConfigs;
DROP TABLE IF EXISTS WriteRateLimits;
DROP TABLE IF EXISTS LoginAttempts;
DROP TABLE IF EXISTS Payments;
DROP TABLE IF EXISTS Orders;
DROP TABLE IF EXISTS BoothLocks;
DROP TABLE IF EXISTS Booths;
DROP TABLE IF EXISTS Prices;
DROP TABLE IF EXISTS Industries;
DROP TABLE IF EXISTS Accounts;
DROP TABLE IF EXISTS Staff;
DROP TABLE IF EXISTS Projects;

PRAGMA foreign_keys = ON;
