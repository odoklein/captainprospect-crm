// ============================================
// LICENSE PEEK — synchronous, dependency-free read of the license that
// lib/license/server already cached in this process. For code that cannot await
// (and for modules that must not pull Prisma in at import, like the call-vault
// client and its tests). A cold process (nothing has loaded the license yet)
// answers "enabled": the first page render or health probe warms it.
// ============================================

import type { LicenseFeature, LicenseValues } from "./resolve";

type Shared = { __licenseCache?: { entry: { license: LicenseValues } | null } };

export function peekFeature(feature: LicenseFeature): boolean {
    const license = (globalThis as unknown as Shared).__licenseCache?.entry?.license;
    return license ? license.features[feature] !== false : true;
}
