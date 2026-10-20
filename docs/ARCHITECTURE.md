# FutureFunded

Premium Mission Commerce.

## Product
- Public fundraising campaigns
- Organizer Studio
- Campaign administration
- Secure donations
- Multi-organization SaaS

## Design
Warm ivory, carbon, Ember orange, restrained gold.

## Authority
One implementation per responsibility.
No version numbers in component filenames.

## Migration
Reference: ~/futurefunded-campaign-cleanroom

Preserve accepted behavior and approved visual design.
Do not import experimental invitation infrastructure.

## Database protection
Operational Neon branch: main.
Development branch: development.

No database-write tests against main.
No operational credentials copied during migration.
