"use client";

import axios from "axios";
import { useFormik } from "formik";
import React, { useContext, useState } from "react";
import { useRouter } from "next/navigation";
import * as Yup from "yup";
import { UserContext } from "../context/User_Context";


export default function Register() {
    let { setLogin, setUser_id, setUserRole } = useContext(UserContext);
    const [apiError, setError] = useState("");
    const [isLoading, setLoading] = useState(false);
    const router = useRouter();

    function handleRegister(formsData) {
        setLoading(true);
        axios
            .post("https://worship-team-api.vercel.app/api/users/register", formsData)
            .then((response) => {
                console.log("success", response);

                if (response.data.msg == "User created successfully") {
                    localStorage.setItem("user_Taspe7_Token", response?.data?.token);
                    localStorage.setItem('user_Taspe7_Role', response?.data?.user?.role)
                    localStorage.setItem('user_Taspe7_ID', response?.data?.user?._id)
                    setLogin(response.data.token);
                    setLoading(false);
                    console.log(response.data.user.role);
                    console.log("Going to login...");


                    router.push("/login");
                }
            })
            .catch((error) => {
                setError(error.response?.data?.message || "Something went wrong");
                setLoading(false);
            });

    }

    let validationSchema = Yup.object({
        Name: Yup.string()
            .required("name is required")
            .min(3, "min lenght is 3")
            .max(10, "max lenght is 10"),
        email: Yup.string()
            .required("email is required")
            .email("enter availed email"),
        password: Yup.string()
            .required("passowrd is required")
            .matches(
                /^[A-Z][a-z0-9]{5,7}$/,
                "min lenth is 6 and max is 8 and first letter should be capital"
            ),
        ChurchName: Yup.string().required("Church Name is required"),
    });

    let formik = useFormik({
        initialValues: {
            Name: "",
            email: "",
            password: "",
            ChurchName: "",
        },
        validationSchema: validationSchema,
        onSubmit: handleRegister,
    });

    return (
        <div className="flex items-center justify-center h-screen px-4 sm:px-6 lg:px-8 bg-linear-to-br from-[#020617] via-[#0f172a] to-[#172554] relative overflow-hidden">
            {/* Background Decoration */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.1),transparent_50%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(37,99,235,0.1),transparent_50%)]" />

            <div className="w-full max-w-xs sm:max-w-md space-y-8 relative z-10 my-auto">
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-8">
                    <h2 className="my-2 text-center text-3xl font-bold tracking-tight bg-gradient-to-r from-sky-400 to-blue-500 bg-clip-text text-transparent">
                        Create Account
                    </h2>
                    <p className="text-center text-gray-400 text-sm mb-6">
                        Join the worship team community
                    </p>

                    {apiError && (
                        <div
                            className="p-4 mb-4 text-sm text-red-200 border border-red-500/20 rounded-lg bg-red-500/10"
                            role="alert"
                        >
                            <span className="font-medium">{apiError}</span>
                        </div>
                    )}

                    <form onSubmit={formik.handleSubmit} className="space-y-5">
                        {/* First Name */}
                        <div>
                            <label
                                htmlFor="firstName"
                                className="block text-sm font-medium text-gray-300"
                            >
                                Name
                            </label>
                            <div className="mt-1">
                                <input
                                    onChange={formik.handleChange}
                                    onBlur={formik.handleBlur}
                                    value={formik.values.Name}
                                    name="Name"
                                    id="Name"
                                    type="text"
                                    required
                                    className="px-4 py-3 block w-full rounded-xl bg-black/20 border border-white/10 text-white placeholder-gray-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 sm:text-sm transition-all"
                                    placeholder="Your Name"
                                />
                                {formik.errors.Name && formik.touched.Name ? (
                                    <div className="mt-1 text-red-400 text-xs text-right">
                                        <span className="font-medium">{formik.errors.Name}</span>
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        {/* Email */}
                        <div>
                            <label
                                htmlFor="email"
                                className="block text-sm font-medium text-gray-300"
                            >
                                Email
                            </label>
                            <div className="mt-1">
                                <input
                                    onChange={formik.handleChange}
                                    onBlur={formik.handleBlur}
                                    value={formik.values.email}
                                    name="email"
                                    id="email"
                                    type="email"
                                    required
                                    className="px-4 py-3 block w-full rounded-xl bg-black/20 border border-white/10 text-white placeholder-gray-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 sm:text-sm transition-all"
                                    placeholder="name@example.com"
                                />
                                {formik.errors.email && formik.touched.email ? (
                                    <div className="mt-1 text-red-400 text-xs text-right">
                                        <span className="font-medium">{formik.errors.email}</span>
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        {/* Password */}
                        <div>
                            <label
                                htmlFor="password"
                                className="block text-sm font-medium text-gray-300"
                            >
                                Password
                            </label>
                            <div className="mt-1">
                                <input
                                    onChange={formik.handleChange}
                                    onBlur={formik.handleBlur}
                                    value={formik.values.password}
                                    name="password"
                                    id="password"
                                    type="password"
                                    required
                                    className="px-4 py-3 block w-full rounded-xl bg-black/20 border border-white/10 text-white placeholder-gray-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 sm:text-sm transition-all"
                                    placeholder="••••••••"
                                />
                                {formik.errors.password && formik.touched.password ? (
                                    <div className="mt-1 text-red-400 text-xs text-right">
                                        <span className="font-medium">{formik.errors.password}</span>
                                    </div>
                                ) : null}
                            </div>
                        </div>


                        {/* ChurchName */}
                        <div>
                            <label
                                htmlFor="ChurchName"
                                className="block text-sm font-medium text-gray-300"
                            >
                                Church Name
                            </label>
                            <div className="mt-1">
                                <input
                                    onChange={formik.handleChange}
                                    onBlur={formik.handleBlur}
                                    value={formik.values.ChurchName}
                                    name="ChurchName"
                                    id="ChurchName"
                                    type="text"
                                    required
                                    className="px-4 py-3 block w-full rounded-xl bg-black/20 border border-white/10 text-white placeholder-gray-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 sm:text-sm transition-all"
                                    placeholder="Enter your church name"
                                />
                                {formik.errors.ChurchName && formik.touched.ChurchName ? (
                                    <div className="mt-1 text-red-400 text-xs text-right">
                                        <span className="font-medium">{formik.errors.ChurchName}</span>
                                    </div>
                                ) : null}
                            </div>
                        </div>


                        {/* Submit Button */}
                        <button
                            type="submit"
                            className={`w-full py-3.5 px-4 rounded-xl text-white font-bold shadow-lg transition-all transform active:scale-95 mt-4
                                ${isLoading
                                    ? 'bg-gray-600/50 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 hover:shadow-sky-500/25'}`}
                        >
                            {isLoading ? "Creating Account..." : "Register"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
