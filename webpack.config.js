import * as path from "path"
import CopyPlugin from "copy-webpack-plugin"
import TerserPlugin from "terser-webpack-plugin"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const webpackConfig = {
  mode: 'development',
  entry: './lib/esm/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    library: 'wbCharts',
    libraryTarget: 'umd',
    filename: 'wb-charts.umd.js',
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.json'],
  },
  optimization: {
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          keep_classnames: true,
        },
      }),
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'src/*.css', to: "[name][ext]", },
      ],
    }),
  ],
  devtool: 'source-map',
  externals: ['d3']
}

export default webpackConfig
