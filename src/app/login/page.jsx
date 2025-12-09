"use client";
import axios from 'axios';
import { useFormik } from 'formik';
import { useContext, useState } from 'react';
import { useRouter } from "next/navigation";
import { UserContext } from '../../app/context/User_Context';
import * as Yup from 'yup';

export default function Login() {
    const { setLogin } = useContext(UserContext);
    const [apiError, setError] = useState('');
    const [isLoading, setLoading] = useState(false);
    const router = useRouter();

    const handleLogin = (formsData) => {
        setLoading(true);
        axios.post('http://localhost:4000/api/users/login', formsData)
            .then((response) => {
                console.log('success', response);
                if (response.data.msg === 'Login successful') {
                    localStorage.setItem('user_Taspe7_Token', response?.data?.token);
                    setLogin(response?.data?.token);
                    setLoading(false);
                    router.push("/"); // redirect to home
                }
            })
            .catch((error) => {
                setError(error.response?.data?.message || "Something went wrong");
                setLoading(false);
            });
    };

    const validationSchema = Yup.object({
        email: Yup.string().required('Email is required').email('Enter a valid email'),
        password: Yup.string()
            .required('Password is required')
            .matches(/^[A-Z][a-z0-9]{5,7}$/, 'Enter a valid password'),
    });

    const formik = useFormik({
        initialValues: { email: "", password: "" },
        validationSchema,
        onSubmit: handleLogin
    });

    return (
        <div className="flex h-screen items-center justify-center px-4 sm:px-6 lg:px-8">
            <div className="w-full max-w-md space-y-8">
                <div className="bg-white shadow-md rounded-md p-6">
                    <h2 className="my-3 text-center text-3xl font-bold tracking-tight text-sky-400">
                        Login Now
                    </h2>

                    {apiError && (
                        <div className="p-4 mb-4 text-sm text-red-800 rounded-lg bg-red-50" role="alert">
                            <span className="font-medium">{apiError}</span>
                        </div>
                    )}

                    <form onSubmit={formik.handleSubmit} className="space-y-6">
                        <div>
                            <label htmlFor="ur-email" className="block text-sm font-medium text-gray-700">Email</label>
                            <input
                                onChange={formik.handleChange}
                                onBlur={formik.handleBlur}
                                value={formik.values.email}
                                name='email'
                                id='ur-email'
                                type="email"
                                required
                                className="px-2 py-3 mt-1 block w-full rounded-md border border-gray-300 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-sky-500 sm:text-sm"
                            />
                            {formik.errors.email && formik.touched.email && (
                                <div className="text-red-600 text-sm">{formik.errors.email}</div>
                            )}
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
                            <input
                                onChange={formik.handleChange}
                                onBlur={formik.handleBlur}
                                value={formik.values.password}
                                name='password'
                                id='password'
                                type="password"
                                required
                                className="px-2 py-3 mt-1 block w-full rounded-md border border-gray-300 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-sky-500 sm:text-sm"
                            />
                            {formik.errors.password && formik.touched.password && (
                                <div className="text-red-600 text-sm">{formik.errors.password}</div>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-2 px-4 bg-sky-400 text-white rounded-md"
                        >
                            {isLoading ? "Loading..." : "Login"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
