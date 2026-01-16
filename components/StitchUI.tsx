"use client";
import React from "react";
import { motion } from "framer-motion";
import { Scene } from "./Scene";

export const StitchUI = () => {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
      },
    },
  };

  return (
    <div className="relative h-screen w-screen bg-black">
      <motion.div
        className="absolute inset-0 z-10 flex flex-col items-center justify-center text-white"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.h1
          className="text-6xl font-bold mb-4"
          variants={itemVariants}
        >
          Stitch UI
        </motion.h1>
        <motion.p className="text-xl" variants={itemVariants}>
          The future of design is here.
        </motion.p>
      </motion.div>
      <div className="absolute inset-0 z-0">
        <Scene />
      </div>
    </div>
  );
};