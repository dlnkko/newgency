import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Usamos el nombre que Supabase sí permite para secrets manuales
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseServiceKey = Deno.env.get('WHOP_SERVICE_ROLE_KEY') ?? ''

const supabase = createClient(supabaseUrl, supabaseServiceKey)

Deno.serve(async (req) => {
  try {
    // Validar que sea un método POST
    if (req.method !== 'POST') {
      return new Response("Method not allowed", { status: 405 })
    }

    const body = await req.json()
    const { action, data } = body
    
    console.log(`Evento de Whop recibido: ${action}`)

    // Extraer datos de la estructura de Whop
    const email = data.user.email
    const whop_user_id = data.user.id
    
    // Definir estado: activo solo si el evento es 'membership.went_active'
    const status = action === 'membership.went_active' ? 'active' : 'inactive'

    // Guardar o actualizar en la tabla whop_users
    const { error } = await supabase
      .from('whop_users')
      .upsert({ 
        whop_user_id, 
        email, 
        status,
        updated_at: new Date().toISOString()
      }, { onConflict: 'whop_user_id' })

    if (error) {
      console.error('Error en Supabase:', error.message)
      throw error
    }

    return new Response(
      JSON.stringify({ ok: true }), 
      { 
        status: 200, 
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*", // Permite que Whop te contacte
          "Access-Control-Allow-Methods": "POST, OPTIONS" 
        } 
      }
    )

  } catch (err) {
    console.error('Error procesando webhook:', err.message)
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 400, 
      headers: { "Content-Type": "application/json" } 
    })
  }
})