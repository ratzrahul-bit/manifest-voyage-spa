import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export type UserRole = 'admin' | 'shipping_line' | 'cha'
export interface AppUser {
  id: string
  email: string
  name: string
  company: string
  role: UserRole
  status: 'active' | 'pending' | 'rejected'
}

interface AuthCtx {
  user: AppUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx>({} as AuthCtx)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchProfile(uid: string): Promise<AppUser | null> {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).single()
    return data as AppUser | null
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session?.user) {
        const p = await fetchProfile(data.session.user.id)
        setUser(p)
      }
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_e, session) => {
      if (session?.user) {
        const p = await fetchProfile(session.user.id)
        setUser(p)
      } else {
        setUser(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string): Promise<string | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return error.message
    return null
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
  }

  return <Ctx.Provider value={{ user, loading, signIn, signOut }}>{children}</Ctx.Provider>
}
