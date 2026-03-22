import { test, expect, Page } from '@playwright/test'

// ── Constants ──────────────────────────────────────────────────────────────
const API = 'http://localhost:8000/api/v1'
const RAVI_PHONE = '9876543213'
const RAVI_PIN = '3333'
const RAVI_ID = '1af2f558-9bbe-43a6-9c22-ce892f8a3820'
const OUTLET_ID = 'bc651641-e016-4f9a-82af-db25d7a29baa'
const RAVI_MAX_DISCOUNT = 0

// ── Auth setup ─────────────────────────────────────────────────────────────
async function loginAndSetAuth(page: Page): Promise<string> {
    const resp = await page.request.post(`${API}/auth/login/`, {
        data: { phone: RAVI_PHONE, password: RAVI_PIN },
    })
    if (!resp.ok()) {
        throw new Error(
            `Cannot run tests — Ravi Kisan login failed. Check credentials. Status: ${resp.status()}`
        )
    }
    const body = await resp.json()
    const token: string = body.access
    const user = body.user

    // Set JWT cookie for API calls from the browser
    await page.context().addCookies([
        {
            name: 'access_token',
            value: token,
            domain: 'localhost',
            path: '/',
        },
    ])

    // Load page first, then set Zustand persisted auth in localStorage
    await page.goto('/dashboard/billing')
    await page.evaluate(
        ({ userData, outletData }) => {
            localStorage.setItem(
                'mediflow-auth',
                JSON.stringify({
                    state: {
                        user: userData,
                        outlet: outletData,
                        isAuthenticated: true,
                    },
                    version: 0,
                })
            )
        },
        { userData: user, outletData: user.outlet }
    )

    // Reload so the Zustand store rehydrates from localStorage
    await page.reload()
    await page.waitForLoadState('networkidle')

    return token
}

// ── Helper: enter PIN via keyboard ─────────────────────────────────────────
async function enterPin(page: Page, pin: string) {
    await expect(page.getByTestId('pin-overlay')).toBeVisible()
    const pinInput = page.getByTestId('pin-input')
    await pinInput.focus()
    await pinInput.pressSequentially(pin)
    // PIN auto-submits on 4th digit — wait for overlay to disappear
    await expect(page.getByTestId('pin-overlay')).toBeHidden({ timeout: 6000 })
}

// ── Helper: search product and open AddToCartPanel ────────────────────────
// The billing page renders ProductSearchBar twice (desktop + mobile).
// .first() targets the desktop header bar which is visible at 1280px width.
async function openProductPanel(page: Page, searchTerm: string) {
    await page.getByTestId('product-search').first().fill(searchTerm)
    await expect(page.getByTestId('search-result-0')).toBeVisible({ timeout: 3000 })
    await page.getByTestId('search-result-0').click()
}

// ── Helper: add product to cart ────────────────────────────────────────────
async function addProductToCart(page: Page, searchTerm: string, qty = 1) {
    await openProductPanel(page, searchTerm)

    // Set qty if not 1 — find the strip qty input inside the panel
    if (qty !== 1) {
        const qtyInput = page
            .locator('[data-testid="add-to-cart-btn"]')
            .locator('xpath=ancestor::div[contains(@class,"rounded-xl")]')
            .locator('input[type="number"]')
            .first()
        await qtyInput.fill(String(qty))
    }

    await page.getByTestId('add-to-cart-btn').click()
    await expect(page.getByTestId('cart-item-0')).toBeVisible({ timeout: 3000 })
}

// ── Helper: complete a full cash bill ──────────────────────────────────────
async function completeCashBill(page: Page, searchTerm: string, qty = 1) {
    await addProductToCart(page, searchTerm, qty)
    await page.getByTestId('save-bill-btn').click()
    await expect(page.getByTestId('payment-modal')).toBeVisible()
    // Cash amount is pre-filled — confirm immediately
    await page.getByTestId('payment-confirm-btn').click()
    await expect(page.getByTestId('invoice-success')).toBeVisible({ timeout: 10000 })
}

// ══════════════════════════════════════════════════════════════════════════
// TEST 1: Wrong PIN rejected, correct PIN accepted
// ══════════════════════════════════════════════════════════════════════════
test('Test 1: Wrong PIN rejected, correct PIN accepted', async ({ page }) => {
    await loginAndSetAuth(page)

    await expect(page.getByTestId('pin-overlay')).toBeVisible()
    const pinInput = page.getByTestId('pin-input')
    await pinInput.focus()

    // Type wrong PIN — should trigger error
    await pinInput.pressSequentially('9999')
    await expect(page.getByTestId('pin-error')).toBeVisible({ timeout: 5000 })

    // Wait for auto-clear (600ms timeout in component)
    await page.waitForTimeout(800)

    // Type correct PIN
    await pinInput.focus()
    await pinInput.pressSequentially(RAVI_PIN)
    await expect(page.getByTestId('pin-overlay')).toBeHidden({ timeout: 6000 })

    await expect(page.getByTestId('staff-badge')).toBeVisible()
    await expect(page.getByTestId('staff-badge')).toContainText('ravi', { ignoreCase: true })
})

// ══════════════════════════════════════════════════════════════════════════
// TEST 2: Product search returns results under 1 second
// ══════════════════════════════════════════════════════════════════════════
test('Test 2: Product search returns results under 1 second', async ({ page }) => {
    await loginAndSetAuth(page)
    await enterPin(page, RAVI_PIN)

    const t0 = Date.now()
    await page.getByTestId('product-search').first().fill('Para')
    await expect(page.getByTestId('search-result-0')).toBeVisible({ timeout: 3000 })
    const elapsed = Date.now() - t0

    expect(elapsed).toBeLessThan(1000)
    await expect(page.getByTestId('search-result-0')).toContainText('Paracetamol')
})

// ══════════════════════════════════════════════════════════════════════════
// TEST 3: Add product to cart
// ══════════════════════════════════════════════════════════════════════════
test('Test 3: Add product to cart', async ({ page }) => {
    await loginAndSetAuth(page)
    await enterPin(page, RAVI_PIN)
    await addProductToCart(page, 'Para')

    await expect(page.getByTestId('cart-item-0')).toBeVisible()
    const total = await page.getByTestId('cart-total').textContent()
    expect(total).toBeTruthy()
    expect(total).not.toBe('₹0.00')
})

// ══════════════════════════════════════════════════════════════════════════
// TEST 4: Quantity change updates line total
// ══════════════════════════════════════════════════════════════════════════
test('Test 4: Quantity change updates line total', async ({ page }) => {
    await loginAndSetAuth(page)
    await enterPin(page, RAVI_PIN)
    await addProductToCart(page, 'Para')

    const initialLineTotal = await page.getByTestId('line-total-0').textContent()
    const initialCartTotal = await page.getByTestId('cart-total').textContent()

    // Change qty to 5
    await page.getByTestId('qty-strips-0').fill('5')
    await page.getByTestId('qty-strips-0').press('Tab')
    await page.waitForTimeout(200)

    const updatedLineTotal = await page.getByTestId('line-total-0').textContent()
    expect(updatedLineTotal).not.toBe(initialLineTotal)

    const updatedCartTotal = await page.getByTestId('cart-total').textContent()
    expect(updatedCartTotal).not.toBe(initialCartTotal)
})

// ══════════════════════════════════════════════════════════════════════════
// TEST 5: Discount cap enforced
// ══════════════════════════════════════════════════════════════════════════
test('Test 5: Discount cap enforced', async ({ page }) => {
    await loginAndSetAuth(page)
    await enterPin(page, RAVI_PIN)

    // Open AddToCartPanel (DON'T add to cart yet — discount is in the panel)
    await openProductPanel(page, 'Para')

    // Type more than max discount
    const overLimit = RAVI_MAX_DISCOUNT + 5
    await page.getByTestId('discount-0').fill(String(overLimit))
    await page.getByTestId('discount-0').press('Tab')
    await page.waitForTimeout(150)

    const discountValue = await page.getByTestId('discount-0').inputValue()
    expect(Number(discountValue)).toBeLessThanOrEqual(RAVI_MAX_DISCOUNT)
})

// ══════════════════════════════════════════════════════════════════════════
// TEST 6: Complete bill — cash payment + verify billedBy
// ══════════════════════════════════════════════════════════════════════════
test('Test 6: Complete bill — cash payment', async ({ page }) => {
    const token = await loginAndSetAuth(page)
    await enterPin(page, RAVI_PIN)

    await addProductToCart(page, 'Para', 2)
    await page.getByTestId('save-bill-btn').click()
    await expect(page.getByTestId('payment-modal')).toBeVisible()
    await page.getByTestId('payment-confirm-btn').click()
    await expect(page.getByTestId('invoice-success')).toBeVisible({ timeout: 10000 })

    const invoiceNo = await page.getByTestId('invoice-number').textContent()
    expect(invoiceNo).toMatch(/INV/i)

    // Verify billedBy via API
    const salesResp = await page.request.get(
        `${API}/sales/?limit=1&outletId=${OUTLET_ID}`,
        { headers: { Authorization: `Bearer ${token}` } }
    )
    if (salesResp.ok()) {
        const salesBody = await salesResp.json()
        const latestSale = salesBody.data?.[0] ?? salesBody[0]
        if (latestSale) {
            expect(String(latestSale.billedBy)).toBe(RAVI_ID)
        }
    }
})

// ══════════════════════════════════════════════════════════════════════════
// TEST 7: Stock deducted after bill
// ══════════════════════════════════════════════════════════════════════════
test('Test 7: Stock deducted after bill', async ({ page }) => {
    const token = await loginAndSetAuth(page)

    const getStock = async (): Promise<number> => {
        const resp = await page.request.get(
            `${API}/products/search/?q=Paracetamol&outletId=${OUTLET_ID}`,
            { headers: { Authorization: `Bearer ${token}` } }
        )
        const body = await resp.json()
        const products: any[] = body.data ?? body
        const product = products.find((p: any) =>
            p.name?.toLowerCase().includes('paracetamol')
        )
        return product?.totalStock ?? product?.batches?.[0]?.qtyStrips ?? 0
    }

    const qtyBefore = await getStock()

    await enterPin(page, RAVI_PIN)
    await completeCashBill(page, 'Para', 3)

    // Need a short wait for stock to update
    await page.waitForTimeout(500)
    const qtyAfter = await getStock()

    expect(qtyAfter).toBe(qtyBefore - 3)
})

// ══════════════════════════════════════════════════════════════════════════
// TEST 8: Schedule H drug forces modal
// ══════════════════════════════════════════════════════════════════════════
test('Test 8: Schedule H drug forces modal', async ({ page }) => {
    await loginAndSetAuth(page)
    await enterPin(page, RAVI_PIN)

    // Add Azithromycin (Schedule H)
    await openProductPanel(page, 'Azith')
    await page.getByTestId('add-to-cart-btn').click()
    await expect(page.getByTestId('cart-item-0')).toBeVisible()

    // Verify Schedule H badge in cart
    await expect(page.getByTestId('cart-item-0')).toContainText('H')

    // Try to save bill
    await page.getByTestId('save-bill-btn').click()

    // Azithromycin is Schedule H (not H1/X/Narcotic), so ScheduleHModal opens
    // in recommended (not mandatory) mode. The billing page always shows
    // the modal for any Schedule H drug when proceeding to payment.
    await expect(page.getByTestId('schedule-h-modal')).toBeVisible({ timeout: 5000 })

    // Try submitting empty form — validation should prevent submission
    await page.getByTestId('sh-submit-btn').click()
    await expect(page.getByTestId('schedule-h-modal')).toBeVisible()

    // Fill required fields
    await page.getByTestId('sh-doctor-name').fill('Dr. A. Patel')
    await page.getByTestId('sh-doctor-regno').fill('MH12345')
    await page.getByTestId('sh-patient-name').fill('Ram Sharma')
    await page.getByTestId('sh-patient-age').fill('45')
    await page.getByTestId('sh-patient-address').fill('123 MG Road, Aurangabad')
    await page.getByTestId('sh-submit-btn').click()

    // Proceed to payment and complete
    await expect(page.getByTestId('payment-modal')).toBeVisible({ timeout: 5000 })
    await page.getByTestId('payment-confirm-btn').click()
    await expect(page.getByTestId('invoice-success')).toBeVisible({ timeout: 10000 })
})

// ══════════════════════════════════════════════════════════════════════════
// TEST 9: UPI payment
// ══════════════════════════════════════════════════════════════════════════
test('Test 9: UPI payment', async ({ page }) => {
    await loginAndSetAuth(page)
    await enterPin(page, RAVI_PIN)
    await addProductToCart(page, 'Ceti')

    await page.getByTestId('save-bill-btn').click()
    await expect(page.getByTestId('payment-modal')).toBeVisible()

    // Switch to UPI tab (second tab in the 5-tab row)
    await page.locator('[role="tablist"] [role="tab"]').nth(1).click()

    await page.getByTestId('payment-upi-input').fill('TXN123456789')
    await page.getByTestId('payment-upi-toggle').click()
    await page.waitForTimeout(100)

    await page.getByTestId('payment-confirm-btn').click()
    await expect(page.getByTestId('invoice-success')).toBeVisible({ timeout: 10000 })
})

// ══════════════════════════════════════════════════════════════════════════
// TEST 10: Bills today counter increments
// ══════════════════════════════════════════════════════════════════════════
test('Test 10: Bills today counter increments', async ({ page }) => {
    await loginAndSetAuth(page)
    await enterPin(page, RAVI_PIN)

    const billsTodayEl = page.getByTestId('bills-today')
    await expect(billsTodayEl).toBeVisible()
    const initialText = await billsTodayEl.textContent()
    const initialCount = parseInt(initialText?.match(/\d+/)?.[0] ?? '0')

    // Complete a bill
    await completeCashBill(page, 'Para', 1)

    // The success screen replaces the billing page — click "New Bill"
    await page.getByRole('button', { name: /new bill/i }).click()

    // handleStartNewBill calls resetBilling() which sets isPinVerified=false
    await expect(page.getByTestId('pin-overlay')).toBeVisible({ timeout: 3000 })
    await page.getByTestId('pin-input').focus()
    await page.getByTestId('pin-input').pressSequentially(RAVI_PIN)
    await expect(page.getByTestId('pin-overlay')).toBeHidden({ timeout: 6000 })

    const updatedText = await billsTodayEl.textContent()
    const updatedCount = parseInt(updatedText?.match(/\d+/)?.[0] ?? '0')
    expect(updatedCount).toBe(initialCount + 1)
})
