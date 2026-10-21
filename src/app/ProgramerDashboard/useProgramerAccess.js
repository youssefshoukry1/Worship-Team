'use client';

import { useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserContext } from '../context/User_Context';
import { controlApiRequest } from '../services/controlApi';

export default function useProgramerAccess() {
    const { isLogin } = useContext(UserContext);
    const query = useQuery({
        queryKey: ['programer-access', isLogin], enabled: Boolean(isLogin), retry: false,
        staleTime: 60000,
        queryFn: async () => {
            // This established endpoint lets the hub work before optional controls
            // are deployed, while checking the account rather than its cached role.
            const profile = await controlApiRequest(isLogin, '/users/my-profile', {}, 'Account access checks');
            if ((profile.user?.global_role || profile.user?.role) !== 'PROGRAMER') {
                const error = new Error('Only PROGRAMER accounts can access these controls.');
                error.status = 403;
                throw error;
            }
            return true;
        },
    });
    return { isLogin, hasAccess: Boolean(isLogin && query.isSuccess),
        isPending: Boolean(isLogin && query.isPending), error: query.error, refetch: query.refetch };
}
