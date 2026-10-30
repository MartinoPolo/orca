/** Login homes reported by SSH hosts, keyed by local target id, so renderers can resolve `~/` account roots. */
const knownHomes = new Map<string, string>()

export function rememberSshRemoteHome(targetId: string, loginHome: string): void {
  knownHomes.set(targetId, loginHome)
}

export function knownSshRemoteHome(targetId: string): string | undefined {
  return knownHomes.get(targetId)
}

export function forgetSshRemoteHome(targetId: string): void {
  knownHomes.delete(targetId)
}
