
import React, { useState, useEffect, useCallback } from 'react';
import LandingPage from './components/LandingPage.tsx';
import Dashboard from './components/Dashboard.tsx';
import ClientPortal from './components/ClientPortal.tsx';
import { supabase, isSupabaseConfigured, type ClientInsert } from './services/supabaseClient.ts';
import { mockClients } from './data/mockData.ts';
import type { Client } from './types.ts';
import type { Session } from '@supabase/supabase-js';
import { Button, Spinner, Card } from './components/ui/common.tsx';

type UpdateClientHandler = (client: Client) => Promise<void>;
type AddClientHandler = (client: ClientInsert) => Promise<void>;

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [isCoach, setIsCoach] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) {
        console.warn("DEMO MODE: Supabase environment variables not set. Running in demo mode with mock data.");
        setIsDemoMode(true);
        setClients(mockClients);
        setIsLoading(false);
        return;
    }

    supabase!.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        setIsLoading(false);
    });

    const { data: { subscription } } = supabase!.auth.onAuthStateChange((_event, session) => {
        setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);
  
  useEffect(() => {
    if(session?.user) {
        const coachEmail = 'coach@rippedcity.com';
        setIsCoach(session.user.email === coachEmail);
    } else {
        setIsCoach(false);
    }
  }, [session]);

  const getClients = useCallback(async () => {
      const { data, error } = await supabase!.from('clients').select('*').order('created_at', { ascending: false });
      if (error) {
          console.error("Error fetching clients:", error);
      } else {
          setClients(data as Client[]);
      }
  }, []);

  useEffect(() => {
    if (isDemoMode) return; // In demo mode, clients are already set

    if (isCoach) {
      getClients();
    } else {
      if (session?.user) {
        supabase!.from('clients').select('*').eq('email', session.user.email).maybeSingle().then(({data}) => {
          if (data) {
            setClients([data as Client]);
          }
        });
      } else {
         setClients([]);
      }
    }
  }, [isCoach, getClients, session, isDemoMode]);


  const handleUpdateClient: UpdateClientHandler = useCallback(async (updatedClient) => {
    if (isDemoMode) {
        console.log("DEMO MODE: Updating client in local state", updatedClient);
        setClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));
        alert("Demo Mode: Client data updated successfully.");
        return;
    }

    const { id, created_at, ...updateData } = updatedClient;
    const { data, error } = await supabase!
      .from('clients')
      .update(updateData as any)
      .eq('id', updatedClient.id)
      .select()
      .single();

    if (error) {
        console.error('Error updating client:', error);
    } else {
        if(data) {
          setClients(prev => prev.map(c => c.id === data.id ? (data as Client) : c));
        }
    }
  }, [isDemoMode]);
  
  const handleAddClient: AddClientHandler = useCallback(async (newClient) => {
      if (isDemoMode) {
        console.log("DEMO MODE: Adding client to local state", newClient);
        const clientToAdd: Client = {
          ...(newClient as any), // Type assertion is acceptable here for demo purposes
          id: `demo_${Date.now()}`,
          created_at: new Date().toISOString(),
        };
        setClients(prev => [clientToAdd, ...prev]);
        alert("Demo Mode: New prospect added successfully.");
        return;
      }

      const { data, error } = await supabase!
        .from('clients')
        .insert([newClient] as any)
        .select()
        .single();
    
    if(error) {
        console.error("Error adding client:", error);
        alert(`Error: ${error.message}`);
    } else {
        if (data) {
          setClients(prev => [(data as Client), ...prev]);
        }
    }
  }, [isDemoMode]);
  
  const handleLogout = useCallback(async () => {
    if (isDemoMode) {
        setSession(null);
        return;
    }
    await supabase!.auth.signOut();
  }, [isDemoMode]);

  const handleDemoLogin = (role: 'coach' | 'client', clientEmail?: string) => {
    if (!isDemoMode) return;
    if (role === 'coach') {
        setSession({ user: { email: 'coach@rippedcity.com' } } as Session);
    } else if (role === 'client' && clientEmail) {
        const clientExists = clients.some(c => c.email === clientEmail);
        if (clientExists) {
            setSession({ user: { email: clientEmail } } as Session);
        } else {
            alert(`Demo Mode Error: Client with email ${clientEmail} not found in mock data.`);
        }
    }
  };
  
  const loggedInClient = !isCoach && session?.user
    ? clients.find(c => c.email === session.user.email) 
    : undefined;

  const renderContent = () => {
    if (isLoading) {
      return <div className="min-h-screen flex items-center justify-center"><Spinner /></div>;
    }
    if (!session) {
        return <LandingPage isDemoMode={isDemoMode} onDemoLogin={handleDemoLogin} />;
    }
    if (isCoach) {
        return <Dashboard onLogout={handleLogout} clients={clients} onUpdateClient={handleUpdateClient} onAddClient={handleAddClient} />;
    }
    if (loggedInClient) {
        return <ClientPortal client={loggedInClient} onLogout={handleLogout} onUpdateClient={handleUpdateClient} />;
    }
    // Fallback while client data might be loading or if not found
    return (
        <div className="min-h-screen flex flex-col items-center justify-center text-center p-4">
            <Spinner />
            <p className="mt-4 text-gray-400">Loading your portal...</p>
             <Button onClick={handleLogout} variant="secondary" className="mt-6">Logout</Button>
        </div>
    );
  }

  return (
    <div className="bg-gray-900 min-h-screen text-gray-200 font-sans antialiased">
      {renderContent()}
    </div>
  );
}

export default App;