import { useEffect, useState } from 'react'
import { fullPhoneNumber, splitPhoneNumber } from '../../services/phoneNumber'
import PhonePrefixPicker, { useCountryCodes } from '../PhonePrefixPicker/PhonePrefixPicker'

interface Props {
  id: string
  /** The whole phone, as it is saved ("+59899123456"). */
  value: string
  onChange: (phone: string) => void
  required?: boolean
  placeholder?: string
}

/**
 * A phone: the country's prefix, chosen with its flag, and the number written as usual in that country. It is
 * read and given back whole, so the form around it keeps one value. Goes inside the parent's field box.
 */
export default function PhoneField({ id, value, onChange, required, placeholder = 'Ej. 099 123 456' }: Readonly<Props>) {
  const countries = useCountryCodes()
  const list = countries.status === 'ready' ? countries.list : null
  const [parts, setParts] = useState(() => splitPhoneNumber(value, list ?? []))

  // Split again when the phone changes from outside (the profile loads, changes are discarded), or when the
  // list arrives and the number could not be split without it. Not while typing: "0" or a space would vanish.
  useEffect(() => {
    setParts(current => value !== fullPhoneNumber(current.prefix.dial, current.number) || (list !== null && current.number.startsWith('+'))
      ? splitPhoneNumber(value, list ?? [])
      : current)
  }, [value, list])

  function change(next: typeof parts) {
    setParts(next)
    onChange(fullPhoneNumber(next.prefix.dial, next.number))
  }

  return (
    <>
      <PhonePrefixPicker value={parts.prefix} onChange={prefix => change({ ...parts, prefix })} />
      <input id={id} type="tel" autoComplete="tel-national" value={parts.number} required={required} placeholder={placeholder}
        onChange={event => change({ ...parts, number: event.target.value })} />
    </>
  )
}
