-- PayFlow SMT — Telnyx as the primary inbound-only voice provider.
--
-- This migration keeps existing Twilio/Fonoster/SIP support, but allows new
-- businesses to be provisioned with Telnyx. PayFlow does not initiate calls.

alter table if exists public.voice_module_settings
  drop constraint if exists voice_module_provider_check;

alter table if exists public.voice_module_settings
  add constraint voice_module_provider_check
  check (provider in ('telnyx', 'twilio', 'fonoster', 'sip', 'custom'));

alter table if exists public.voice_module_settings
  alter column provider set default 'telnyx';

-- Pending rows with no technical route were never activated. Move only those
-- untouched rows to Telnyx so an already-provisioned Twilio business is not
-- changed accidentally.
update public.voice_module_settings
set provider = 'telnyx',
    human_transfer_enabled = false,
    human_transfer_phone = null
where provider = 'twilio'
  and activation_status in ('not_enabled', 'requested', 'provisioning')
  and coalesce(provider_phone_id, '') = ''
  and coalesce(routing_phone, '') = '';

-- The current PayFlow product receives calls only. Human transfer would create
-- another outbound call leg, so it remains disabled for all non-active rows.
update public.voice_module_settings
set human_transfer_enabled = false,
    human_transfer_phone = null
where activation_status <> 'active';
