import { stripe } from '../libs/stripe.js'

/**
 * Creates a Stripe PaymentIntent for card confirmation (evaluation payment modal).
 * Mirrors fv_frontend_2025/src/app/api/create-payment-intent/route.js — required in production
 * because fundsverifier.com serves /api/* from Express, not Next.js.
 */
export const createPaymentIntent = async (req, res) => {
  try {
    const hasStripeKey = Boolean(process.env.STRIPE_SECRET_KEY?.trim())
    if (!hasStripeKey) {
      console.error(
        '[create-payment-intent] STRIPE_SECRET_KEY is missing or empty'
      )
      return res.status(500).json({
        error:
          'Payments are not configured on this server (missing STRIPE_SECRET_KEY).',
      })
    }

    const { amount, customerId, email } = req.body

    console.log('[create-payment-intent] incoming body', {
      amount,
      amountValid: Boolean(amount) && !Number.isNaN(Number(amount)),
      hasCustomerId: Boolean(customerId),
      hasEmail: Boolean(email && String(email).trim()),
    })

    if (!amount || Number.isNaN(Number(amount))) {
      console.warn(
        '[create-payment-intent] rejected: invalid or missing amount'
      )
      return res
        .status(400)
        .json({ error: 'Amount is required and must be a number' })
    }

    if (!email || !String(email).trim()) {
      console.warn('[create-payment-intent] rejected: missing email')
      return res.status(400).json({
        error: 'Email is required if no customerId is provided',
      })
    }

    const emailTrimmed = String(email).trim()
    const existingCustomers = await stripe.customers.list({
      email: emailTrimmed,
      limit: 1,
    })

    let customer
    if (existingCustomers?.data?.length > 0) {
      customer = existingCustomers.data[0].id
    } else {
      const newCustomer = await stripe.customers.create({
        email: emailTrimmed,
      })
      customer = newCustomer.id
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Number(amount),
      currency: 'aed',
      customer,
      setup_future_usage: 'off_session',
      automatic_payment_methods: { enabled: true },
    })

    return res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      customerId: customer,
      paymentMethodId: paymentIntent.payment_method,
    })
  } catch (error) {
    console.error('Stripe error:', error)
    return res.status(500).json({
      error: error.message || 'Something went wrong',
    })
  }
}
