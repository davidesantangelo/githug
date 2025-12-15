export default async (request, context) => {
    // Only allow POST requests
    if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        const body = await request.json();
        const code = body.code;
        const clientRedirectUri = body.redirect_uri;

        if (!code) {
           return new Response(JSON.stringify({ error: "Missing code parameter" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            }); 
        }

        const clientId = Deno.env.get("GITHUG_SERVER_CLIENT_ID");
        const clientSecret = Deno.env.get("GITHUG_SERVER_CLIENT_SECRET");
        const redirectUri = clientRedirectUri || Deno.env.get("GITHUG_SERVER_REDIRECT_URI") || "http://localhost:5173/callback";

        if (!clientId || !clientSecret) {
            return new Response(JSON.stringify({ error: "Server missing GitHub OAuth credentials" }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }

        const response = await fetch("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify({
                client_id: clientId,
                client_secret: clientSecret,
                code,
                redirect_uri: redirectUri,
            }),
        });

        const data = await response.json();

        if (data.error) {
            return new Response(JSON.stringify({ error: data.error, error_description: data.error_description }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({
            access_token: data.access_token,
            token_type: data.token_type,
            scope: data.scope,
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });

    } catch (err) {
        console.error("GitHub token exchange failed:", err);
         return new Response(JSON.stringify({ error: "Token exchange failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};
