export const ADMIN_ERRORS = {
  username_taken: 'That username is already in use.',
  invalid_username: '3–32 characters: letters, numbers, dot, dash, underscore.',
  password_too_short: 'Password must be at least 8 characters.',
  last_admin: 'There must always be at least one admin.',
  cannot_demote_self: 'You cannot remove your own admin rights.',
  cannot_delete_self: 'You cannot delete your own account.',
  store_exists: 'That store already exists.',
  invalid_store: 'Enter a store name.',
  unsupported_version: 'That file is not a supported Stockaroo backup.',
  no_admin_in_backup: 'That backup contains no admin user.',
  invalid_payload: 'That file is not a valid backup.'
};
