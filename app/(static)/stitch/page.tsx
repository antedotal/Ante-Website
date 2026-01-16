
'use client';
import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PlexusCanvas } from '@/components/ui/Plexus';
import { Code, Share2, Layers } from 'lucide-react';

const StitchPage = () => {
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
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        duration: 0.5,
      },
    },
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center p-8 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full z-0">
        <PlexusCanvas />
      </div>
      <div className="relative z-10 w-full flex flex-col items-center">
        <motion.header
          className="w-full max-w-5xl mx-auto flex justify-between items-center py-4"
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className="text-2xl font-bold">Stitch</div>
          <nav className="flex items-center space-x-6">
            <a href="#" className="text-gray-400 hover:text-white">Home</a>
            <a href="#" className="text-gray-400 hover:text-white">About</a>
            <a href="#" className="text-gray-400 hover:text-white">Contact</a>
          </nav>
        </motion.header>

        <motion.main
          className="flex flex-col items-center text-center mt-20"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.h1
            className="text-6xl font-bold mb-6 bg-gradient-to-r from-blue-500 to-purple-500 text-transparent bg-clip-text"
            variants={itemVariants}
          >
            Stitch all your <br /> data sources
          </motion.h1>

          <motion.p
            className="text-lg text-gray-400 max-w-2xl mb-12"
            variants={itemVariants}
          >
            Unify your data from multiple sources into a single, coherent view.
            Stitch provides a seamless way to connect, transform, and visualize your data.
          </motion.p>

          <motion.div className="flex space-x-4 mb-20" variants={itemVariants}>
            <Button>Get Started</Button>
            <Button variant="outline">Read the docs</Button>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-5xl"
            variants={containerVariants}
          >
            <motion.div variants={itemVariants}>
              <Card className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 p-6 rounded-lg text-center h-full">
                <Code className="w-12 h-12 mx-auto mb-4 text-blue-500" />
                <h3 className="text-xl font-bold mb-2">Connect Everything</h3>
                <p className="text-gray-400">
                  Integrate with a wide range of data sources, from databases to APIs and third-party services.
                </p>
              </Card>
            </motion.div>
            <motion.div variants={itemVariants}>
              <Card className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 p-6 rounded-lg text-center h-full">
                <Layers className="w-12 h-12 mx-auto mb-4 text-green-500" />
                <h3 className="text-xl font-bold mb-2">Transform & Model</h3>
                <p className="text-gray-400">
                  Clean, reshape, and model your data to fit your business logic and analytical needs.
                </p>
              </Card>
            </motion.div>
            <motion.div variants={itemVariants}>
              <Card className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 p-6 rounded-lg text-center h-full">
                <Share2 className="w-12 h-12 mx-auto mb-4 text-purple-500" />
                <h3 className="text-xl font-bold mb-2">Visualize & Share</h3>
                <p className="text-gray-400">
                  Create stunning visualizations and dashboards to share insights across your organization.
                </p>
              </Card>
            </motion.div>
          </motion.div>
        </main>
      </div>
    </div>
  );
};

export default StitchPage;
