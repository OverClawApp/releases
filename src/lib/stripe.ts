import { loadStripe } from '@stripe/stripe-js'

export const stripePromise = loadStripe('pk_live_51T0meSEFXOKXciuuu2KcBidhV81Ou2rgJ1kDbW2NXI3kHxzFaNtmwd9DHBFTWXY9zCMW2PCh5Z6cq160RXwrdfZn00Y54kWIlV')

// Price IDs mapping
export const STRIPE_PRICES = {
  personal: {
    monthly: 'price_1T0nlbEFXOKXciuuUqtEvzO6',
    annual: 'price_1T0nlbEFXOKXciuuwEPyIphN',
  },
  pro: {
    monthly: 'price_1T0nljEFXOKXciuuBjZKCd2g',
    annual: 'price_1T0nlkEFXOKXciuuRSh6zwWE',
  },
  team: {
    monthly: 'price_1T0nlrEFXOKXciuu1047sYQU',
    annual: 'price_1T0nlsEFXOKXciuu4Yt6xvFh',
  },
  scale: {
    monthly: 'price_1T0nm0EFXOKXciuuxGYp3zt0',
    annual: 'price_1T0nm1EFXOKXciuuGwfZy1Jt',
    extraNode: 'price_1T0nm1EFXOKXciuunPqO6Utj',
  },
} as const
