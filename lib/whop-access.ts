/**
 * Helper function to check if a user has access to a Whop resource
 * Uses the official Whop API checkAccess endpoint
 * @see https://docs.whop.com/api-reference/users/check-access
 */

export interface WhopAccessCheck {
  has_access: boolean;
  access_level: 'no_access' | 'admin' | 'customer';
}

/**
 * Check if a user has access to a Whop resource (product, company, or experience)
 * @param userId - The Whop user ID (user_xxx) or username
 * @param resourceId - The resource ID (prod_xxx for product, biz_xxx for company, exp_xxx for experience)
 * @param apiKey - The Whop API key
 * @returns Access check result with has_access and access_level
 */
export async function checkWhopAccess(
  userId: string,
  resourceId: string,
  apiKey: string
): Promise<WhopAccessCheck> {
  try {
    const response = await fetch(
      `https://api.whop.com/api/v2/users/${userId}/access/${resourceId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error checking Whop access:', response.status, errorText);
      throw new Error(`Whop API error: ${response.status} - ${errorText}`);
    }

    const data: WhopAccessCheck = await response.json();
    return data;
  } catch (error) {
    console.error('Error in checkWhopAccess:', error);
    throw error;
  }
}

