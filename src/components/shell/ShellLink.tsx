import { Link, useLocation, type LinkProps } from 'react-router-dom'
import { shellAwarePath } from '../../lib/shellPath'

/** Link that preserves duo vs dashboard shell prefix. */
export default function ShellLink({ to, ...rest }: LinkProps) {
  const location = useLocation()
  const href = typeof to === 'string' ? shellAwarePath(to, location.pathname) : to
  return <Link to={href} {...rest} />
}
