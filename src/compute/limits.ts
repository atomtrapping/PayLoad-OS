/**
 * The byte limits the clearance and registration manifests are held to.
 *
 * They lived in the contract modules, which encode records through Buffer;
 * the inspectors that verify a served artifact against its digest in the
 * browser need the same limits without those modules, so the numbers are
 * declared here and the contracts import them.
 */
export const MAX_CLEARANCE_MANIFEST_BYTES = 256 * 1024;
export const MAX_REGISTRATION_MANIFEST_BYTES = 256 * 1024;
